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
  return { level: g.level, R: pl.R, half: pl.half, shape: pl.shape, style: pl.style, total: pl.total, ms: Math.round(ms),
    atmosphere: Boolean(pl.atmosphere),
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
        t.ok(len(levels) == 6, 'six levels in the cycle', [l.get('shape', 'sphere') + '/' + l.get('style', 'cubes') for l in levels])

        for level in range(1, len(levels) + 2):
            want = levels[(level - 1) % len(levels)]
            b = await page.evaluate(BUILD, level)
            shape = want.get('shape', 'sphere')
            t.ok(b['shape'] == shape and b['style'] == want.get('style', 'cubes'),
                 f"planet {level}: {shape}, {b['style']}", f"{b['total']} voxels, built in {b['ms']} ms")
            if shape in ('sphere', 'cube'):
                t.ok(abs(b['half'] - R * want['radiusScale']) <= 0.25, f"planet {level}: size {2 * b['half']:.1f}")
            t.ok(b['atmosphere'] == (shape == 'sphere'), f'planet {level}: atmosphere only around spheres')
            if want.get('style', 'cubes') == 'cubes':
                t.ok(b['cubesVisible'] and b['triangles'] == 0, f'planet {level}: plain cubes')
            else:
                t.ok(b['triangles'] > 1000, f"planet {level}: {want['style']} surface built", b['triangles'])
                t.ok(b['cubesVisible'] == (want['style'] != 'smooth'), f'planet {level}: cubes shown only where wanted')
            if shots:
                await page.wait_for_timeout(600)
                await page.screenshot(path=os.path.join(shots, f'level{level}.png'))
            if want.get('style', 'cubes') != 'cubes':
                e = await page.evaluate(EAT)
                t.ok(e['eaten'] > 0 and e['dirtyChunks'] > 0 and e['dirtyAfter'] == 0,
                     f'planet {level}: eating marks chunks dirty and they are rebuilt', e)
                if shots:
                    await page.wait_for_timeout(600)
                    await page.screenshot(path=os.path.join(shots, f'level{level}-eaten.png'))

        small = await page.evaluate(BUILD, 1)
        full = await page.evaluate(BUILD, 2)
        t.ok(abs(small['R'] / full['R'] - 0.7) < 0.01, 'planet 1 radius is 30% smaller than planet 2')
        box = await page.evaluate(BUILD, 5)
        side = round(2 * box['half'] / 0.5)
        t.ok(box['total'] == side ** 3 and abs(box['half'] - small['R']) <= 0.25,
             'planet 5: a full cube with the edge of planet 1\'s diameter', f"{side}³ = {box['total']}")

        # planet 6: the text — every letter has its own colour, and the swarm can eat it
        txt = await page.evaluate(BUILD, 6)
        info = await page.evaluate('''() => { const pl = window.__dbg.planet; const seen = new Set();
          for (let i = 0; i < pl.tags.length; i++) if (pl.tags[i]) seen.add(pl.tags[i]);
          const cols = [...seen].map(t => pl.tagColors[t].join(','));
          return { letters: seen.size, colours: new Set(cols).size, exposed: pl.count }; }''')
        t.ok(info['letters'] == 7 and info['colours'] == 7, 'planet 6: "TEST LVL" — 7 letters in 7 colours', info)
        await page.evaluate('''() => { const g = window.__dbg, p = g.localPlayer;
          p.onNewPlanet(); p.setSetting('count', 200); p.setSetting('speed', 0.3); p.setSetting('power', 1.5); g.stop(); }''')
        before = txt['total']
        await h.fast_forward(page, 1500)
        st = await page.evaluate('() => ({ level: window.__dbg.level, left: window.__dbg.planet.left })')
        t.ok(st['level'] > 6 or st['left'] < before, 'the swarm eats the text',
             'eaten whole, next planet' if st['level'] > 6 else f"{before} → {st['left']}")

        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
