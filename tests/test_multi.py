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
            await host.click('.menu-choice >> nth=2')  # Multiplayer · PvP
            await host.wait_for_selector('.menu-card .lobby-link', timeout=20000)
            code = (await host.input_value('.menu-card .lobby-link')).split('room=')[1]
            t.ok(len(code) == 6, 'room created', code)

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
            late = await h.open_page(browser, f'{url}?room={code}', errors, 'late', peer=True)
            await late.wait_for_function("document.getElementById('menu').hidden", timeout=40000)
            t.ok(await late.evaluate('() => window.__dbg.started'), 'joining a running match plays straight away')
            await host.evaluate('() => window.__dbg.net.close()')
            await late.wait_for_function("document.getElementById('menu').innerText.includes('host left')", timeout=20000)
            t.ok(True, 'guest sees "The host left the room"')
            await browser.close()
    finally:
        peer.kill()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
