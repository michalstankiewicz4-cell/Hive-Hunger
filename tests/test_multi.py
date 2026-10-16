"""Multiplayer with a local PeerJS server: waiting room, Start / Not ready, symmetric
spawns, same planet and scores on host and guests, leaving.

Run from the repository root:  python tests/test_multi.py

Note: every page renders WebGL in software. On a small machine, pages of guests that
have joined are paused (`__dbg.stop()`); they still receive network messages."""

import asyncio
import math
import sys

from playwright.async_api import async_playwright

import harness as h

SPAWNS = """() => window.__dbg.activePlayers().map(p => ({ index: p.index, ready: p.ready,
  angle: Math.round(Math.atan2(p.spawnSpace.x, p.spawnSpace.z) * 180 / Math.PI) }))"""
GAME = """() => { const g = window.__dbg; return { started: g.started, level: g.level, seed: g.planet && g.planet.seed,
  left: g.planet && g.planet.left, scores: g.activePlayers().map(p => p.score) }; }"""


def gaps(spawns):
    """Angles between neighbouring spawns, sorted around the planet."""
    a = sorted(s['angle'] % 360 for s in spawns)
    return [round((a[(i + 1) % len(a)] - a[i]) % 360) for i in range(len(a))]


async def ready(page):
    await page.click('.menu-start')
    await page.wait_for_timeout(700)


async def main():
    h.check_setup()
    url = h.start_static_server()
    peer = h.start_peer_server()
    t = h.Checks('test_multi')
    errors = []
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(args=h.BROWSER_ARGS)
            host = await h.open_page(browser, url, errors, 'host', peer=True)
            # play single player first: points, an upgrade, part of the planet eaten …
            await host.click('.menu-choice >> nth=0')
            await host.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('count', 200); p.setSetting('speed', 0.4); }")
            await h.fast_forward(host, 400)
            await host.evaluate("() => { window.__dbg.localPlayer.score += 100; window.__dbg.buyUpgrade('units1'); }")
            solo = await host.evaluate('() => ({ score: window.__dbg.localPlayer.score, left: window.__dbg.planet.left, total: window.__dbg.planet.total })')
            await host.keyboard.press('Escape')
            # … then a PvP room: nothing carries over except the settings panel
            await host.click('.menu-choice >> nth=2')  # Multiplayer · PvP
            await host.wait_for_selector('.menu-card .lobby-link', timeout=20000)
            code = (await host.input_value('.menu-card .lobby-link')).split('room=')[1]
            t.ok(len(code) == 6, 'room created', code)
            await host.wait_for_timeout(700)
            t.ok(await host.locator('.control-levels').is_hidden(), 'no level switch in multiplayer')
            fresh = await host.evaluate('''() => { const g = window.__dbg, p = g.localPlayer;
              return { score: p.score, owned: [...p.tree.owned], level: g.level, left: g.planet.left, total: g.planet.total,
                count: p.base.count, units: p.swarm.count }; }''')
            t.ok(solo['score'] > 0 and fresh['score'] == 0 and fresh['owned'] == ['core'] and fresh['level'] == 1
                 and fresh['left'] == fresh['total'], 'a room starts from scratch (no points, upgrades or eaten planet from single player)', fresh)
            t.ok(fresh['count'] == 200 and fresh['units'] == 200, 'the settings panel values stay', fresh['count'])
            await host.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('count', 20); p.setSetting('speed', 0.05); }")

            guests = []
            for k in range(2):
                g = await h.open_page(browser, f'{url}?room={code}', errors, f'guest{k}', peer=True)
                await g.wait_for_selector('.menu-start', timeout=40000)
                await g.evaluate('() => window.__dbg.stop()')
                guests.append(g)
            await host.wait_for_timeout(1000)

            sp = await host.evaluate(SPAWNS)
            t.ok(len(sp) == 3 and all(abs(x - 120) <= 1 for x in gaps(sp)), '3 players: spawns 120° apart', gaps(sp))
            t.ok(await guests[0].evaluate(SPAWNS) == sp, 'guests see the same spawns')

            # Start / Not ready
            await ready(host)
            await ready(guests[0])
            t.ok(not (await host.evaluate(GAME))['started'], 'no start while one player is not ready')
            await ready(guests[0])  # Not ready
            sp = await host.evaluate(SPAWNS)
            t.ok([s['ready'] for s in sp] == [True, False, False], 'Not ready takes Start back', [s['ready'] for s in sp])
            await ready(guests[0])
            await ready(guests[1])
            hs = await host.evaluate(GAME)
            t.ok(hs['started'], 'the match starts when everyone pressed Start')
            t.ok(await guests[1].evaluate('() => window.__dbg.started') and await guests[1].locator('#menu').is_hidden(),
                 'guests start too')

            # upgrades in multiplayer: a guest buys through the host with its own points
            await host.evaluate('() => { window.__dbg.players[2].score = 500; }')
            await h.fast_forward(host, 20)
            await guests[1].wait_for_function('() => window.__dbg.localPlayer.points === 500', timeout=10000)
            await guests[1].evaluate("() => { window.__dbg.buyUpgrade('units1'); window.__dbg.buyUpgrade('bolt1'); }")
            await host.wait_for_timeout(1000)
            await guests[1].evaluate("() => window.__dbg.buyUpgrade('units2')")
            await host.wait_for_timeout(1000)
            hp = await host.evaluate('() => { const p = window.__dbg.players[2]; return { owned: [...p.tree.owned], spent: p.tree.spent, count: p.swarm.count, base: p.base.count }; }')
            gp = await guests[1].evaluate('() => { const p = window.__dbg.localPlayer; return { owned: [...p.tree.owned], points: p.points }; }')
            t.ok('units1' in hp['owned'] and 'bolt1' in hp['owned'] and hp['count'] == hp['base'] + 20,
                 'guest upgrades are applied on the host', hp)
            t.ok(sorted(gp['owned']) == sorted(hp['owned']) and gp['points'] == 500 - hp['spent'],
                 'the guest gets its tree and points back', gp)
            before = await guests[0].evaluate('() => window.__dbg.lightning.shown')
            await h.fast_forward(host, 6 * 60 + 30)
            await host.wait_for_timeout(1000)
            t.ok(await guests[0].evaluate('() => window.__dbg.lightning.shown') > before, 'other guests see the lightning')

            # play a little on the host, then compare
            await host.evaluate("""() => window.__dbg.activePlayers().forEach(p => {
              p.setSetting('count', 200); p.setSetting('speed', 0.5); p.setSetting('power', 2); })""")
            await h.fast_forward(host, 1200)
            await host.wait_for_timeout(1500)
            for g in guests:  # let paused guests apply the queued snapshots
                await g.evaluate('() => { const g = window.__dbg; for (let f = 0; f < 5; f++) g.update(); }')
            hs, gs = await host.evaluate(GAME), await guests[1].evaluate(GAME)
            t.ok(hs['seed'] == gs['seed'] and hs['level'] == gs['level'], 'same planet on host and guest')
            t.ok(hs['left'] < 463400 and abs(hs['left'] - gs['left']) < 2000, 'guest follows the eaten voxels',
                 f"host {hs['left']} guest {gs['left']}")
            t.ok(sum(hs['scores']) > 0, 'swarms eat', hs['scores'])

            # finish the planet: summary for everyone, the next planet only after everyone pressed Next planet
            # slower for the last scraps: at high speed a unit turns in a wide arc and can circle an
            # isolated voxel without reaching it (known issue, see CONTEXT.md)
            await host.evaluate("() => window.__dbg.activePlayers().forEach(p => p.setSetting('speed', 0.1))")
            for _ in range(30):
                if (await host.evaluate(GAME))['left'] == 0:
                    break
                await h.fast_forward(host, 200)
            await host.wait_for_timeout(1000)
            t.ok((await host.evaluate(GAME))['left'] == 0, 'the planet is eaten')
            t.ok(await host.locator('#summary').is_visible() and await guests[1].locator('#summary').is_visible(),
                 'summary shown on host and guests')
            text = await guests[1].inner_text('#summary')
            t.ok(('wins this planet' in text or 'You win this planet' in text) and 'Share' in text and 'Won' in text, 'PvP summary: winner, shares, planets won',
                 text.replace(chr(10), ' | ')[:200])
            rows = await host.evaluate('() => window.__dbg.summary.rows.map(r => r.planet)')
            t.ok(rows == sorted(rows, reverse=True), 'players sorted by voxels eaten', rows)
            await host.click('#summary .menu-start')
            await guests[0].click('#summary .menu-start')
            await host.wait_for_timeout(800)
            await h.fast_forward(host, 1700)  # swarms are home (or the timeout passed)
            t.ok((await host.evaluate(GAME))['level'] == 1, 'no next planet while a player has not pressed Next planet')
            await guests[1].click('#summary .menu-start')
            await host.wait_for_timeout(800)
            await h.fast_forward(host, 100)
            await host.wait_for_timeout(1000)
            t.ok((await host.evaluate(GAME))['level'] == 2 and await host.locator('#summary').is_hidden()
                 and await guests[1].locator('#summary').is_hidden(), 'everyone pressed: next planet, summary closed')

            # a piece bitten off on the host drifts on every screen; eating it there shows on the guests
            cut = await host.evaluate("""() => { const g = window.__dbg, pl = g.planet, N = pl.N;
              let lo = -1; for (let i = 0; i < N && lo < 0; i++) for (let idx = i; idx < pl.hp.length; idx += N) if (pl.hp[idx] > 0) { lo = i; break; }
              for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) { const idx = (k * N + j) * N + lo + 3; if (pl.hp[idx] > 0) pl.remove(idx); }
              g.update();
              const f = pl.fragments.list[0];
              return f ? { id: f.id, count: f.count } : null; }""")
            await host.wait_for_timeout(1500)
            frag = 'pl => { const f = pl.fragments.list[0]; return f ? { id: f.id, count: f.count, pos: f.pos.toArray() } : null; }'
            gf = await guests[1].evaluate(f'() => ({frag})(window.__dbg.planet)')
            t.ok(cut is not None and gf is not None and gf['id'] == cut['id'] and gf['count'] == cut['count'],
                 'a piece bitten off on the host drifts on the guests too', f'host {cut} guest {gf}')
            await host.evaluate("""() => { const g = window.__dbg, pl = g.planet, fr = pl.fragments, f = fr.list[0];
              for (const idx of fr.exposedOf(f).slice(0, 10)) pl.remove(idx);
              g.update(); g.update(); g.update(); g.update(); }""")
            await host.wait_for_timeout(1500)
            await guests[1].evaluate('() => { const g = window.__dbg; for (let f = 0; f < 3; f++) g.update(); }')
            hf = await host.evaluate(f'() => ({frag})(window.__dbg.planet)')
            gf = await guests[1].evaluate(f'() => ({frag})(window.__dbg.planet)')
            dist = sum((a - b) ** 2 for a, b in zip(hf['pos'], gf['pos'])) ** 0.5
            t.ok(gf['count'] == hf['count'] == cut['count'] - 10 and dist < 0.5,
                 'voxels eaten off the piece disappear on the guests; it is in the same place', f"host {hf['count']} guest {gf['count']}, {dist:.2f} apart")

            # bitten through, the piece breaks up on the guests too
            sp = await host.evaluate('''(q) => { const g = window.__dbg, pl = g.planet, fr = pl.fragments, N = pl.N;
              const f = fr.list[0], cells = fr.cellsOf(f), js = cells.map(c => ((c / N) | 0) % N).sort((a, b) => a - b);
              const cut = js[Math.floor(js.length * q)], before = f.count, ids = fr.list.map(x => x.id);
              const p0 = f.pos.clone(); if (g.update) {}
              let eaten = 0; for (const c of cells) if (((c / N) | 0) % N === cut) { pl.remove(c); eaten++; }
              g.update();
              const kids = fr.list.filter(x => !ids.includes(x.id));
              const k = kids[0];
              return { before, eaten, parent: f.dead ? 0 : f.count, kids: kids.map(x => x.count), id: k ? k.id : null,
                gap: k ? k.pos.distanceTo(f.pos) : 0, moved: f.pos.distanceTo(p0) }; }''', 0.3)
            await host.wait_for_timeout(1500)
            await guests[1].evaluate('() => { const g = window.__dbg; for (let f = 0; f < 3; f++) g.update(); }')
            gk = await guests[1].evaluate('(id) => { const fr = window.__dbg.planet.fragments, k = fr.byId.get(id), f = fr.byId.get(1); return { kid: k ? k.count : null, parent: f ? f.count : null }; }', sp['id'])
            t.ok(sp['id'] is not None and gk['kid'] == sp['kids'][0] and gk['parent'] == sp['parent'],
                 'a piece bitten through on the host breaks up the same way on the guests', f'host {sp} guest {gk}')

            # connection stats: every guest has a measured ping, shown in the HUD and the room panel
            stats = await host.evaluate('() => window.__dbg.netStats')
            t.ok(stats[0].get('host') and all(isinstance(x.get('rtt'), int) for x in stats[1:]), 'ping measured for every guest', stats)
            await guests[1].evaluate('() => window.__dbg.updateHud()')
            hud = await guests[1].inner_text('#hud')
            t.ok('host' in hud and ' ms' in hud, 'HUD shows the ping next to the players', hud.replace(chr(10), ' | ')[:160])
            t.ok('Hosting' in await host.inner_text('#lobby'), 'room panel shows the host its connection')

            # a guest leaves (says goodbye): "left", the others are spread again
            await guests[0].evaluate('() => window.__dbg.net.close()')
            await host.wait_for_timeout(1500)
            notes = await host.evaluate('() => window.__dbg.notices.map(n => n.text)')
            t.ok('Pink left the room' in notes, 'leaving shows "Pink left the room"', notes)
            sp = await host.evaluate(SPAWNS)
            t.ok(len(sp) == 2 and all(abs(x - 180) <= 1 for x in gaps(sp)), 'after leaving: 2 players opposite', gaps(sp))
            g1_notes = await guests[1].evaluate('() => window.__dbg.notices.map(n => n.text)')
            t.ok('Pink left the room' in g1_notes, 'other guests see the notice too', g1_notes)

            # a connection that closes without a goodbye: "connection lost"
            await guests[1].evaluate('() => window.__dbg.net.conn.close()')
            await host.wait_for_timeout(2500)
            notes = await host.evaluate('() => window.__dbg.notices.map(n => n.text)')
            t.ok('Green: connection lost' in notes, 'a dropped connection shows "Green: connection lost"', notes)

            # the host closes the room: a guest who joins the running match is told the host left
            await h.fast_forward(host, 400)  # some craters for the late guest to receive
            late = await h.open_page(browser, f'{url}?room={code}', errors, 'late', peer=True)
            await late.wait_for_function("document.getElementById('menu').hidden", timeout=40000)
            t.ok(await late.evaluate('() => window.__dbg.started'), 'joining a running match plays straight away')
            await late.wait_for_timeout(1500)
            hl = await host.evaluate('() => [window.__dbg.planet.left, window.__dbg.planet.total]')
            ll = await late.evaluate('() => [window.__dbg.planet.left, window.__dbg.planet.total]')
            t.ok(hl[1] == ll[1] and hl[0] < hl[1] and abs(hl[0] - ll[0]) < 3000,
                 'a late guest gets the eaten voxels (compressed planet message)', f'host {hl} late {ll}')
            # hold still while comparing (the last frames send what is still queued)
            await host.evaluate('() => { const g = window.__dbg; g.stop(); do g.update(); while (g.frameNo % g.cfg.net.snapshotEvery !== 0); }')
            await late.wait_for_timeout(2500)
            await late.evaluate('() => { const g = window.__dbg; for (let f = 0; f < 3; f++) g.update(); }')
            hc = await host.evaluate('() => window.__dbg.planet.fragments.list.map(f => [f.id, f.count])')
            lc = await late.evaluate('() => window.__dbg.planet.fragments.list.map(f => [f.id, f.count])')
            t.ok(len(hc) > 0 and sorted(hc) == sorted(lc), 'a late guest gets the drifting pieces', f'host {hc} late {lc}')
            await host.evaluate('() => window.__dbg.start()')
            await host.evaluate('() => window.__dbg.net.close()')
            await late.wait_for_function("document.getElementById('menu').innerText.includes('host left')", timeout=20000)
            t.ok(True, 'guest sees "The host left the room"')
            await browser.close()
    finally:
        peer.kill()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
