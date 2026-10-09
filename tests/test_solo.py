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
        t.ok(s['level'] == 2 and s['alive'] and s['left'] > 0.9 * s['total'], 'next planet appears after the swarm is home',
             f"level {s['level']}, {s['left']} of {s['total']} left")
        t.ok(s['home'] is None, 'the swarm is back to work on the new planet')

        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
