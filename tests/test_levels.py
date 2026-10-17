"""Planet levels: the missions that can be played (CONFIG.levels: the Kuiper Belt first, then the bodies in the
solar system map's order), their shapes and sizes, all drawn as a smooth surface that is built and
updated when voxels are eaten; the map's bodies.

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
  g.mission = level - 1;
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
        bodies = [l.get('body') for l in levels]
        t.ok(bodies[0] == 'kuiper' and 'earth' in bodies and all(l.get('style') == 'smooth' for l in levels),
             f'{len(levels)} missions to play, the Kuiper Belt first, Earth among them, all smooth', [l.get('body') + '/' + l.get('shape', 'sphere') for l in levels])
        solar = await page.evaluate("async () => (await import('./js/solar.js')).SOLAR.map((b) => b.id)")
        t.ok(len(solar) == 20 and solar[0] == 'kuiper' and solar[-1] == 'sun' and solar.index('pluto') < solar.index('neptune') < solar.index('jupiter') < solar.index('earth') < solar.index('mercury'),
             'the map: 20 bodies from the Kuiper Belt in to the Sun, in order', solar)
        t.ok(all(l['body'] in solar for l in levels) and [solar.index(b) for b in bodies] == sorted(solar.index(b) for b in bodies), 'every mission is a body of the map, in the map\'s order', bodies)

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

        # planet 1: the Kuiper Belt — a long band of small irregular asteroids (10 × as long as it is wide,
        # very slightly bent), none touching another; every one in its own (icy) shade; the same belt from the same seed
        await page.evaluate(BUILD, 1)
        belt = await page.evaluate('''() => { const g = window.__dbg, pl = g.planet, L = g.cfg.levels[0]; const rock = new Map(), v = new window.THREE.Vector3();
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, zMid = 0, nMid = 0, zEnd = 0, nEnd = 0;
          for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) {
            const t = pl.tags[idx], [i, j, k] = pl.coords(idx);
            const b = rock.get(t) || { n: 0, i0: 1e9, i1: -1, j0: 1e9, j1: -1, k0: 1e9, k1: -1 };
            b.n++; b.i0 = Math.min(b.i0, i); b.i1 = Math.max(b.i1, i); b.j0 = Math.min(b.j0, j); b.j1 = Math.max(b.j1, j); b.k0 = Math.min(b.k0, k); b.k1 = Math.max(b.k1, k);
            rock.set(t, b);
            pl.gridCenter(idx, v);
            // back into the band's own frame (it is tipped back by pitch and turned by yaw)
            v.applyAxisAngle(new window.THREE.Vector3(0, 1, 0), -(L.yaw || 0)).applyAxisAngle(new window.THREE.Vector3(1, 0, 0), -(L.pitch || 0));
            x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
            if (Math.abs(v.x) < 10) { zMid += v.z; nMid++; } else if (Math.abs(v.x) > 90) { zEnd += v.z; nEnd++; }
          }
          // a voxel of one rock next to a voxel of another (they would touch)
          let touching = 0;
          for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) {
            const [i, j, k] = pl.coords(idx);
            for (const [a, b, c] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const n = pl.index(i + a, j + b, k + c); if (n >= 0 && pl.hp[n] > 0 && pl.tags[n] !== pl.tags[idx]) touching++; }
          }
          const list = [...rock.values()], span = list.map((b) => Math.max(b.i1 - b.i0, b.j1 - b.j0, b.k1 - b.k0) + 1);
          const first = pl.total;
          g.planet.dispose(); g.spawnPlanet(12345);
          return { rocks: list.length, want: L.count, pl: pl.rocks, touching, minSpan: Math.min(...span), maxSpan: Math.max(...span), total: first, again: g.planet.total,
            grid: [pl.NX, pl.NY, pl.NZ], tilted: Boolean(L.pitch) && Boolean(L.view), length: Math.round(x1 - x0), width: Math.round(y1 - y0), bent: Math.round((zMid / nMid - zEnd / nEnd) * 10) / 10,
            colours: new Set(list.map((_, n) => pl.tagColors[n + 1].join(','))).size, irregular: list.filter((b) => b.n < (b.i1 - b.i0 + 1) * (b.j1 - b.j0 + 1) * (b.k1 - b.k0 + 1) * 0.6).length }; }''')
        t.ok(belt['rocks'] == belt['want'] == belt['pl'] and belt['touching'] == 0, f"planet 1: the Kuiper Belt — {belt['want']} asteroids, none touching another", belt)
        t.ok(8.5 <= belt['length'] / belt['width'] <= 11 and belt['width'] >= 20 and 4 < belt['bent'] < 30 and belt['grid'][0] > 3 * belt['grid'][1],
             'a band as wide as the old ring\'s radius and five rings long, very slightly bent; its grid long and flat', belt)
        t.ok(belt['tilted'] and belt['grid'][1] > 30 and belt['grid'][2] > 40, 'the band is tipped back (and the camera turned at the start): it is seen at an angle', belt['grid'])
        t.ok(belt['minSpan'] >= 2 and belt['maxSpan'] <= 9 and belt['irregular'] > belt['rocks'] // 3, 'small, irregular rocks (lumps of overlapping balls)', belt)
        t.ok(belt['colours'] > 10 and belt['total'] == belt['again'], 'each in its own shade; the same seed builds the same belt', belt)

        # Earth — the full planet
        full = await page.evaluate(BUILD, bodies.index('earth') + 1)
        t.ok(full['shape'] == 'sphere' and abs(full['R'] - R) < 0.01, 'Earth, the full-size planet', full)
        await page.evaluate(BUILD, 1)
        await page.evaluate('''() => { const g = window.__dbg, p = g.localPlayer;
          p.onNewPlanet(); p.setSetting('count', 100); p.setSetting('speed', 0.3); p.setSetting('power', 1.5); g.started = true; g.stop(); }''')
        await h.fast_forward(page, 1500)
        st = await page.evaluate('() => ({ left: window.__dbg.planet.left, total: window.__dbg.planet.total, body: window.__dbg.bodyId })')
        t.ok(st['body'] == bodies[1] or st['left'] < st['total'], 'the swarm eats the asteroids', 'eaten whole, the next one up' if st['body'] == bodies[1] else st)

        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
