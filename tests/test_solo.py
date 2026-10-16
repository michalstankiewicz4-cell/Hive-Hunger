"""Single player: start screen, Esc menu, eating a whole planet, return home, next planet.

Run from the repository root:  python tests/test_solo.py"""

import asyncio
import sys

from playwright.async_api import async_playwright

import harness as h

STATE = """() => {
  const g = window.__dbg, p = g.localPlayer, pl = g.planet;
  const s = p.swarm, c = s.center();
  let inside = 0, shared = 0;
  const seen = new Set();
  for (let i = 0; i < s.count; i++) {
    if (pl.alive && pl.isSolid({ x: s.pos[i * 3], y: s.pos[i * 3 + 1], z: s.pos[i * 3 + 2] })) inside++;
    const f = s.food[i];
    if (f >= 0) { if (seen.has(f)) shared++; seen.add(f); }
  }
  return { started: g.started, level: g.level, left: pl.left, total: pl.total, alive: pl.alive,
    score: p.score, home: p.homeMode, inside, shared, cx: c.x, spin: g.spin };
}"""


# a ship that has landed is turned away from its bite: it must face it again before eating
AIM = """(laser) => { const g = window.__dbg, s = g.localPlayer.swarm, pl = g.planet;
            const pick = () => { for (let k = laser ? 0 : s.lasers; k < (laser ? s.lasers : s.count); k++) if (s.landed[k] && s.food[k] >= 0 && s.aimed[k]) return k; return -1; };
            let i = pick(); for (let f = 0; i < 0 && f < 300; f++) { g.update(); i = pick(); }
            if (i < 0) return { found: false };
            // turn it away from its bite: it stops firing until it faces it again
            // (a direction at right angles to the one to its bite)
            const i3 = i * 3, d = [s.dir[i3], s.dir[i3 + 1], s.dir[i3 + 2]];
            const side = Math.abs(d[0]) < 0.9 ? [0, d[2], -d[1]] : [-d[2], 0, d[0]], sl = Math.hypot(...side);
            s.look[i3] = side[0] / sl; s.look[i3 + 1] = side[1] / sl; s.look[i3 + 2] = side[2] / sl;
            const food = s.food[i], hp0 = pl.strengthOf(food);
            g.update(); s.render(g.camera);
            const turning = { aimed: s.aimed[i], firing: s.firing[i], hp: pl.strengthOf(food) };
            let frames = 0; while (!s.aimed[i] && frames < 120 && s.landed[i]) { g.update(); frames++; }
            return { found: true, hp0, turning, frames, aimedLater: s.aimed[i] }; }"""


async def main():
    h.check_setup()
    url = h.start_static_server()
    t = h.Checks('test_solo')
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=h.BROWSER_ARGS)
        page = await h.open_page(browser, url, errors, 'solo')

        # start screen
        choices = await page.locator('.menu-choice').all_inner_texts()
        t.ok(len(choices) == 3 and 'Single player' in choices[0], 'start screen offers 3 modes', choices)
        title = await page.inner_text('#menu-title')
        version = await page.inner_text('#version')
        t.ok(title.startswith('Hive Hunger') and title.endswith(version) and version.startswith('v0.'), 'start screen shows the version next to the title', title)
        before = await page.evaluate(STATE)
        await page.wait_for_timeout(800)
        after = await page.evaluate(STATE)
        t.ok(not after['started'] and before['cx'] == after['cx'] and after['spin'] == 0,
             'nothing moves before a mode is chosen')

        # single player
        await page.click('.menu-choice >> nth=0')
        await page.wait_for_timeout(500)
        s = await page.evaluate(STATE)
        t.ok(s['started'] and await page.locator('#menu').is_hidden(), 'Single player starts the game')

        # Esc pauses and shows the start screen, Esc again carries on
        await page.keyboard.press('Escape')
        a = await page.evaluate(STATE)
        await page.wait_for_timeout(800)
        b = await page.evaluate(STATE)
        t.ok(not b['started'] and a['cx'] == b['cx'] and await page.locator('#menu').is_visible(),
             'Esc pauses and shows the start screen')
        await page.keyboard.press('Escape')
        t.ok((await page.evaluate(STATE))['started'] and await page.locator('#menu').is_hidden(), 'Esc again carries on')
        await page.keyboard.press('Escape')
        await page.click('.menu-choice >> nth=0')
        t.ok((await page.evaluate(STATE))['started'], 'Single player on the start screen carries on too')
        t.ok(await page.evaluate("() => !document.querySelector('[id*=menu-button]') && !window.__dbg.planet.atmosphere"),
             'no Menu button and no atmosphere')

        # level switch (single player): a planet right away, the swarm starts again from its beacon
        levels = await page.locator('.control-levels button').all_inner_texts()
        t.ok(levels == ['1', '2', '3', '4', '5'] and await page.locator('.control-levels').is_visible(), 'level switch in the panel', levels)
        await page.click('.control-levels button >> nth=2')
        await page.wait_for_timeout(300)
        jump = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet;
          const c = s.center(), home = p.spawnWorld(); let inside = 0;
          for (let i = 0; i < s.count; i++) { const idx = pl.cellAt({ x: s.pos[i * 3], y: s.pos[i * 3 + 1], z: s.pos[i * 3 + 2] }); if (idx >= 0 && pl.hp[idx] > 0) inside++; }
          return { level: g.level, shape: pl.shape, home: Math.hypot(c.x - home.x, c.y - home.y, c.z - home.z), inside, left: pl.left, total: pl.total,
            pressed: document.querySelector('.control-levels button[aria-pressed=true]').textContent }; }""")
        t.ok(jump['level'] == 3 and jump['shape'] == 'cube' and jump['pressed'] == '3', 'level 3 (the cube) right away', jump)
        t.ok(jump['home'] < 5 and jump['inside'] == 0, 'the swarm starts again from its beacon, not inside the planet', jump)
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('speed', 0.3)")
        await h.fast_forward(page, 400)
        after_jump = await page.evaluate('() => window.__dbg.planet.left')
        t.ok(after_jump < jump['total'], 'and starts eating the new planet', f"{jump['total']} → {after_jump}")
        await page.click('.control-levels button >> nth=0')
        await page.wait_for_timeout(300)
        t.ok((await page.evaluate('() => [window.__dbg.level, window.__dbg.planet.shape]')) == [1, 'boxes'], 'back to level 1')

        # ship types (bottom-right): 1 red laser ship by default; lasers eat from 5 voxels away, 10% slower
        ui = await page.evaluate("() => [+document.getElementById('ships-eaters').value, +document.getElementById('ships-lasers').value, window.__dbg.localPlayer.swarm.lasers]")
        t.ok(ui == [19, 1, 1], 'ship types: 19 eaters and 1 red laser ship by default', ui)
        await page.click('.control-levels button >> nth=1')
        await page.evaluate("""() => { const e = document.getElementById('ships-eaters'); e.value = 12; e.dispatchEvent(new Event('input'));
          window.__dbg.localPlayer.setSetting('speed', 0.3); }""")
        await page.wait_for_timeout(400)
        ui = await page.evaluate("() => [+document.getElementById('ships-eaters').value, +document.getElementById('ships-lasers').value, window.__dbg.localPlayer.swarm.lasers]")
        t.ok(ui == [12, 8, 8], 'the sliders are linked: 12 eaters → 8 lasers', ui)
        sp = await page.evaluate("""() => { const g = window.__dbg, s = g.localPlayer.swarm; g.update();
          const before = Array.from(s.pos); g.update();
          const step = (i) => Math.hypot(s.pos[i * 3] - before[i * 3], s.pos[i * 3 + 1] - before[i * 3 + 1], s.pos[i * 3 + 2] - before[i * 3 + 2]);
          const L = [], E = []; for (let i = 0; i < s.count; i++) (i < s.lasers ? L : E).push(step(i));
          return { laser: Math.max(...L), eater: Math.max(...E) }; }""")
        t.ok(abs(sp['laser'] - 0.27) < 0.005 and abs(sp['eater'] - 0.3) < 0.005, 'laser ships fly 10% slower', sp)
        await h.fast_forward(page, 500)
        lz = await page.evaluate("""() => { const g = window.__dbg, s = g.localPlayer.swarm; s.render(g.camera);
          const d = (i) => { const i3 = i * 3; return Math.hypot(s.pos[i3] - s.foodPos[i3], s.pos[i3 + 1] - s.foodPos[i3 + 1], s.pos[i3 + 2] - s.foodPos[i3 + 2]); };
          const L = [], E = []; for (let i = 0; i < s.count; i++) if (s.landed[i] && s.food[i] >= 0) (i < s.lasers ? L : E).push(d(i));
          const red = s.mesh.instanceColor.getX(0) > 0.9 && s.mesh.instanceColor.getY(0) < 0.5, blue = s.mesh.instanceColor.getZ(s.count - 1) > 0.9;
          return { laser: L.length ? Math.min(...L) : 0, eater: E.length ? Math.max(...E) : 9, beams: s.beamCount, red, blue }; }""")
        t.ok(lz['laser'] > 1.5 and lz['eater'] < 1.5 and lz['beams'] > 0, 'laser ships eat from a distance (with a beam), eaters up close', lz)
        t.ok(lz['red'] and lz['blue'], 'laser ships are red', lz)
        frames = {}
        for kind in ("laser", "eater"):
            aim = await page.evaluate(AIM, kind == "laser")
            t.ok(aim.get('found') and aim['turning']['aimed'] == 0 and aim['turning']['firing'] == 0 and aim['turning']['hp'] == aim['hp0'],
                 f'a {kind} ship does not eat while it turns towards its bite', aim)
            t.ok(aim.get('aimedLater') == 1 and 5 < aim.get('frames', 0) < 60, f'a {kind} ship eats once it faces its bite', aim)
            frames[kind] = aim.get('frames', 0)
        # slider Turning: slower turning → it takes longer to face the bite
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('turn', 0.04)")
        slow = await page.evaluate(AIM, True)
        t.ok(slow.get('found') and slow['frames'] > 2 * frames['laser'], 'Turning slider: slower ships take longer to face their bite', f"{frames['laser']} → {slow['frames']} frames")
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('turn', window.__dbg.cfg.swarm.turnSmoothing)")
        await page.click('.control-levels button >> nth=0')
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('lasers', 1)")

        # eat the whole planet with a big, fast swarm
        await page.evaluate("""() => { const p = window.__dbg.localPlayer;
          p.setSetting('count', 300); p.setSetting('speed', 0.5); p.setSetting('power', 2.5); }""")
        worst_inside = worst_shared = 0
        for _ in range(60):
            await h.fast_forward(page, 400)
            s = await page.evaluate(STATE)
            worst_inside = max(worst_inside, s['inside'])
            worst_shared = max(worst_shared, s['shared'] if s['left'] > 300 else 0)
            if s['left'] == 0 or s['level'] > 1:
                break
        t.ok(s['left'] == 0 or s['level'] > 1, 'the planet is eaten to the last voxel', s['left'])
        t.ok(worst_inside == 0, 'no unit inside solid voxels', worst_inside)
        t.ok(worst_shared == 0, 'no bite shared while free voxels are left', worst_shared)

        # return home, then the next planet
        for _ in range(20):
            s = await page.evaluate(STATE)
            if s['level'] > 1:
                break
            await h.fast_forward(page, 200)
        # (the swarm may already have started on it)
        t.ok(s['level'] == 2 and s['alive'] and 0 < s['left'] <= s['total'], 'next planet appears after the swarm is home',
             f"level {s['level']}, {s['left']} of {s['total']} left")
        t.ok(s['home'] is None, 'the swarm is back to work on the new planet')

        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
