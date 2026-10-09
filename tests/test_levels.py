"""Planet levels: size and graphics of each level in the cycle (CONFIG.levels), the extra
surfaces ('smooth', 'wedges') being built and updated when voxels are eaten.

Run from the repository root:  python tests/test_levels.py
Set SHOTS=<folder> to save a screenshot of every level there."""

import asyncio
import os
import sys

from playwright.async_api import async_playwright

import harness as h

# builds planet `level` (seed fixed) and reports what was built and how long it took
BUILD = """(level) => {
  const g = window.__dbg;
  g.planet.dispose();
  g.level = level - 1;
  const t = performance.now();
  g.spawnPlanet(12345);
  const ms = performance.now() - t;
  const pl = g.planet;
  return { level: g.level, R: pl.R, style: pl.style, total: pl.total, ms: Math.round(ms),
    cubesVisible: pl.mesh.visible, triangles: pl.surface ? pl.surface.triangles : 0 };
}"""

# eats a few craters out of the surface and rebuilds the extra surface right away
EAT = """() => {
  const pl = window.__dbg.planet;
  let eaten = 0;
  for (let n = 0; n < 6; n++) {
    const idx = pl.idxOfSlot[(n * 997) % pl.count];
    pl.biteSphere(idx, 2.5, 100, () => eaten++);
  }
  const before = pl.surface ? pl.surface.dirty.size : 0;
  if (pl.surface) pl.surface.sync(true);
  pl.sync();
  return { eaten, dirtyChunks: before, triangles: pl.surface ? pl.surface.triangles : 0,
    dirtyAfter: pl.surface ? pl.surface.dirty.size : 0 };
}"""


async def main():
    h.check_setup()
    url = h.start_static_server()
    shots = os.environ.get('SHOTS')
    t = h.Checks('test_levels')
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=h.BROWSER_ARGS)
        page = await h.open_page(browser, url, errors, 'levels')
        await page.click('.menu-choice >> nth=0')
        levels = await page.evaluate('() => window.__dbg.cfg.levels')
        R = await page.evaluate('() => window.__dbg.cfg.planet.radius')
        t.ok(len(levels) == 4, 'four levels in the cycle', levels)

        for level in range(1, len(levels) + 2):
            want = levels[(level - 1) % len(levels)]
            b = await page.evaluate(BUILD, level)
            t.ok(abs(b['R'] - R * want['radiusScale']) < 1e-6 and b['style'] == want['style'],
                 f"planet {level}: radius {b['R']:.1f}, style {b['style']}", f"{b['total']} voxels, built in {b['ms']} ms")
            if want['style'] == 'cubes':
                t.ok(b['cubesVisible'] and b['triangles'] == 0, f'planet {level}: plain cubes')
            else:
                t.ok(b['triangles'] > 1000, f"planet {level}: {want['style']} surface built", b['triangles'])
                t.ok(b['cubesVisible'] == (want['style'] != 'smooth'), f'planet {level}: cubes shown only where wanted')
            if shots:
                await page.wait_for_timeout(600)
                await page.screenshot(path=os.path.join(shots, f'level{level}.png'))
            if want['style'] != 'cubes':
                e = await page.evaluate(EAT)
                t.ok(e['eaten'] > 0 and e['dirtyChunks'] > 0 and e['dirtyAfter'] == 0,
                     f'planet {level}: eating marks chunks dirty and they are rebuilt', e)
                if shots:
                    await page.wait_for_timeout(600)
                    await page.screenshot(path=os.path.join(shots, f'level{level}-eaten.png'))

        small = await page.evaluate(BUILD, 1)
        full = await page.evaluate(BUILD, 2)
        t.ok(abs(small['R'] / full['R'] - 0.7) < 0.01, 'planet 1 radius is 30% smaller than planet 2')

        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
