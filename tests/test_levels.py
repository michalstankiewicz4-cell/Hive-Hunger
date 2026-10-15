"""Planet levels: shape and size of each level in the cycle (CONFIG.levels), all drawn as a
smooth surface that is built and updated when voxels are eaten.

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
        t.ok(len(levels) == 5 and all(l.get('style') == 'smooth' for l in levels), 'five levels in the cycle, all smooth', [l.get('shape', 'sphere') + '/' + l.get('style', 'cubes') for l in levels])

        for level in range(1, len(levels) + 2):
            want = levels[(level - 1) % len(levels)]
            b = await page.evaluate(BUILD, level)
            shape = want.get('shape', 'sphere')
            t.ok(b['shape'] == shape and b['style'] == want.get('style', 'cubes'),
                 f"planet {level}: {shape}, {b['style']}", f"{b['total']} voxels, built in {b['ms']} ms")
            if shape in ('sphere', 'cube'):
                t.ok(abs(b['half'] - R * want['radiusScale']) <= 0.25, f"planet {level}: size {2 * b['half']:.1f}")
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

        # planet 1: every box shape from 1×1×1 to 4×4×4 once, 5 voxels apart
        await page.evaluate(BUILD, 1)
        bx = await page.evaluate('''() => { const pl = window.__dbg.planet, N = pl.N; const box = new Map();
          for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) {
            const t = pl.tags[idx], i = idx % N, j = ((idx / N) | 0) % N, k = (idx / (N * N)) | 0;
            const b = box.get(t) || { n: 0, i0: 1e9, i1: -1, j0: 1e9, j1: -1, k0: 1e9, k1: -1 };
            b.n++; b.i0 = Math.min(b.i0, i); b.i1 = Math.max(b.i1, i); b.j0 = Math.min(b.j0, j); b.j1 = Math.max(b.j1, j); b.k0 = Math.min(b.k0, k); b.k1 = Math.max(b.k1, k);
            box.set(t, b);
          }
          const list = [...box.values()].map(b => ({ size: [b.i1 - b.i0 + 1, b.j1 - b.j0 + 1, b.k1 - b.k0 + 1], full: b.n === (b.i1 - b.i0 + 1) * (b.j1 - b.j0 + 1) * (b.k1 - b.k0 + 1), b }));
          // smallest gap between two boxes that overlap in the other two directions
          let gap = 1e9;
          for (const p of list) for (const q of list) if (p !== q) {
            const ov = (a0, a1, b0, b1) => a0 <= b1 && b0 <= a1;
            if (ov(p.b.j0, p.b.j1, q.b.j0, q.b.j1) && ov(p.b.k0, p.b.k1, q.b.k0, q.b.k1) && q.b.i0 > p.b.i1) gap = Math.min(gap, q.b.i0 - p.b.i1 - 1);
            if (ov(p.b.i0, p.b.i1, q.b.i0, q.b.i1) && ov(p.b.k0, p.b.k1, q.b.k0, q.b.k1) && q.b.j0 > p.b.j1) gap = Math.min(gap, q.b.j0 - p.b.j1 - 1);
          }
          return { boxes: list.length, total: pl.total, sizes: [...new Set(list.map(b => b.size.join('x')))].length, shapes: [...new Set(list.map(b => [...b.size].sort().join('x')))].length,
            allFull: list.every(b => b.full), gap, colours: new Set(list.map((_, n) => pl.tagColors[n + 1].join(','))).size }; }''')
        t.ok(bx['boxes'] == 20 and bx['shapes'] == 20 and bx['allFull'] and bx['total'] == 350,
             'planet 1: every box shape from 1×1×1 to 4×4×4 once, no rotated copies (20 boxes, 350 voxels)', bx)
        t.ok(bx['gap'] == 5 and bx['colours'] == 20, 'planet 1: boxes 5 voxels apart, each in its own colour', bx['gap'])

        # planet 5: a sphere and a cube side by side — every voxel of both is still a voxel to eat
        small = await page.evaluate(BUILD, 5)
        Rv = round(small['R'] / 0.5)
        pair = await page.evaluate('''() => { const pl = window.__dbg.planet; let sphere = 0, cube = 0;
          for (let i = 0; i < pl.hp.length; i++) if (pl.hp[i] > 0) { const c = pl.cellCenter(i, new window.THREE.Vector3()); if (c.x < 0) sphere++; else cube++; }
          return { sphere, cube, total: pl.total, style: pl.style }; }''')
        t.ok(pair['cube'] == (2 * Rv) ** 3 and pair['sphere'] > 0.5 * (2 * Rv) ** 3 and pair['sphere'] + pair['cube'] == pair['total']
             and pair['style'] == 'smooth', 'planet 5: a sphere and a full cube, smooth; all their voxels count', pair)
        full = await page.evaluate(BUILD, 2)
        t.ok(abs(small['R'] / full['R'] - 0.7) < 0.01, 'planet 5: sphere radius 30% smaller than planet 2')
        box = await page.evaluate(BUILD, 3)
        side = round(2 * box['half'] / 0.5)
        t.ok(box['total'] == side ** 3 and abs(box['half'] - small['R']) <= 0.25,
             'planet 3: a full cube with the edge of the small sphere\'s diameter', f"{side}³ = {box['total']}")

        # planet 4: the text — every letter has its own colour, and the swarm can eat it
        txt = await page.evaluate(BUILD, 4)
        info = await page.evaluate('''() => { const pl = window.__dbg.planet; const seen = new Set();
          for (let i = 0; i < pl.tags.length; i++) if (pl.tags[i]) seen.add(pl.tags[i]);
          const cols = [...seen].map(t => pl.tagColors[t].join(','));
          return { letters: seen.size, colours: new Set(cols).size, exposed: pl.count }; }''')
        t.ok(info['letters'] == 7 and info['colours'] == 7, 'planet 4: "TEST LVL" — 7 letters in 7 colours', info)
        await page.evaluate('''() => { const g = window.__dbg, p = g.localPlayer;
          p.onNewPlanet(); p.setSetting('count', 200); p.setSetting('speed', 0.3); p.setSetting('power', 1.5); g.stop(); }''')
        before = txt['total']
        await h.fast_forward(page, 1500)
        st = await page.evaluate('() => ({ level: window.__dbg.level, left: window.__dbg.planet.left })')
        t.ok(st['level'] > 4 or st['left'] < before, 'the swarm eats the text',
             'eaten whole, next planet' if st['level'] > 4 else f"{before} → {st['left']}")

        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
