"""Pieces bitten off a planet: when eating cuts a body in two, every part smaller than the rest
comes loose, drifts and turns, and the swarm can still chase and eat it. Parts of equal size
both stay. Bodies that were apart from the start (the boxes) are never compared. The test boards
(a cube, boxes) are built here for the test.

Run from the repository root:  python tests/test_fragments.py
Set SHOTS=<folder> to save a screenshot of a drifting piece there."""

import asyncio
import os
import sys

from playwright.async_api import async_playwright

import harness as h

# test boards (not missions of the game any more — their shapes are still there, see shapes.js):
# a cube, and every box shape from 1×1×1 to 4×4×4 once, 5 voxels apart
CUBE = {'body': 'test-cube', 'shape': 'cube', 'radiusScale': 0.7, 'style': 'smooth'}
BOXES = {'body': 'test-boxes', 'shape': 'boxes', 'max': 4, 'gap': 5, 'style': 'smooth'}

# builds a planet of `look` (added to the levels for the test) and starts it; the test drives it
BUILD = """(look) => {
  const g = window.__dbg, L = g.cfg.levels;
  let n = L.findIndex((l) => l.body === look.body);
  if (n < 0) { L.push(look); n = L.length - 1; }
  g.planet.dispose();
  g.mission = n;
  g.level = 0;
  g.spawnPlanet(12345);
  g.started = true;
  const pl = g.planet;
  return { N: pl.N, total: pl.total, left: pl.left };
}"""

# eats the whole plane x = i (grid column) of solid voxels, then lets one frame find the split
CUT = """(i) => {
  const g = window.__dbg, pl = g.planet, N = pl.N;
  let cut = 0;
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) {
    const idx = (k * N + j) * N + i;
    if (pl.hp[idx] > 0) { pl.remove(idx); cut++; }
  }
  pl.fragments.step(true);
  const fr = pl.fragments;
  return { cut, left: pl.left, frags: fr.list.map(f => ({ id: f.id, count: f.count })) };
}"""

MOTION = """(frames) => {
  const fr = window.__dbg.planet.fragments, f = fr.list[0];
  const p0 = f.pos.clone(), q0 = f.quat.clone();
  for (let n = 0; n < frames; n++) fr.step(true);
  return { moved: f.pos.distanceTo(p0), turned: 2 * Math.acos(Math.min(1, Math.abs(q0.dot(f.quat)))),
    triangles: f.surface.triangles };
}"""


async def main():
    h.check_setup()
    url = h.start_static_server()
    shots = os.environ.get('SHOTS')
    t = h.Checks('test_fragments')
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=h.BROWSER_ARGS)
        page = await h.open_page(browser, url, errors, 'fragments')
        await page.click('.menu-choice >> nth=0')
        await page.evaluate('() => window.__dbg.stop()')

        # a cube: cut off a slab 3 voxels thick — the slab comes loose, the rest stays
        b = await page.evaluate(BUILD, CUBE)
        lo = await page.evaluate('''() => { const pl = window.__dbg.planet, N = pl.N;
          for (let i = 0; i < N; i++) for (let idx = i; idx < pl.hp.length; idx += N) if (pl.hp[idx] > 0) return i; }''')
        c = await page.evaluate(CUT, lo + 3)
        side = round((b['total']) ** (1 / 3))
        t.ok(len(c['frags']) == 1 and c['frags'][0]['count'] == 3 * side * side,
             'a slab cut off a cube comes loose as one piece', c['frags'])
        t.ok(c['left'] == b['total'] - c['cut'], 'coming loose is not eating: only the cut voxels count', c['left'])
        m = await page.evaluate(MOTION, 120)
        t.ok(m['moved'] > 0.3 and m['turned'] > 0.05 and m['triangles'] > 100, 'the piece drifts, turns and is drawn smooth', m)
        # a click can land on a drifting piece (ships are sent only to voxels)
        ck = await page.evaluate('''() => { const g = window.__dbg, pl = g.planet, f = pl.fragments.list.find((x) => !x.dead), T = window.THREE;
          const from = f.pos.clone().multiplyScalar(4).add(new T.Vector3(0, 0.01, 0)), ray = new T.Ray(from, f.pos.clone().sub(from).normalize());
          const out = new T.Vector3(), hit = pl.raycastSolid(ray, out, true);
          const miss = pl.raycastSolid(new T.Ray(from, from.clone().normalize()), new T.Vector3(), true);
          return { hit: Boolean(hit), onPiece: hit ? pl.fragments.at(out) >= 0 || out.distanceTo(f.pos) <= f.radius + 1 : false, miss }; }''')
        t.ok(ck['hit'] and ck['onPiece'] and ck['miss'] is None, 'a click hits a drifting piece; empty space hits nothing', ck)
        if shots:
            await page.evaluate('() => { const g = window.__dbg; g.renderer.render(g.scene, g.camera); }')
            await page.screenshot(path=os.path.join(shots, 'fragment.png'))

        # its voxels move with it and can still be eaten (same points)
        e = await page.evaluate('''() => { const g = window.__dbg, pl = g.planet, fr = pl.fragments, f = fr.list[0];
          const idx = fr.exposedOf(f)[0];
          const now = pl.cellCenter(idx, new window.THREE.Vector3()), grid = pl.gridCenter(idx, new window.THREE.Vector3());
          const p = g.localPlayer, before = p.score, left = pl.left;
          g.biteCell(idx, -1, p);
          for (let n = 0; n < 60 && pl.solid(idx); n++) g.biteCell(idx, -1, p);
          return { away: now.distanceTo(grid), solid: pl.solid(idx), score: p.score - before, left: left - pl.left,
            near: fr.exposedNear ? (() => { const out = []; pl.exposedNear(now, 3, out); return out.length; })() : 0 }; }''')
        t.ok(e['away'] > 0.3 and not e['solid'] and e['score'] >= 1 and e['score'] == e['left'],
             'a piece\'s voxels move with it and are eaten for points', e)
        t.ok(e['near'] > 0, 'the swarm finds drifting voxels near a point', e['near'])

        # a big piece turns slowly enough for drones to keep up, and never drifts too far
        lim = await page.evaluate('''() => { const g = window.__dbg, fr = g.planet.fragments, f = fr.list[0], c = g.cfg.fragments;
          const rim = f.spin.length() * f.radius;
          for (let n = 0; n < 3000; n++) fr.step(true);
          return { rim, max: c.maxRimSpeed, away: f.pos.distanceTo(f.pivot), maxDistance: c.maxDistance, still: f.vel.length() }; }''')
        t.ok(lim['rim'] <= lim['max'] + 1e-6, 'a big piece\'s edge moves no faster than maxRimSpeed', lim)
        t.ok(lim['away'] <= lim['maxDistance'] + 1e-6, 'a piece stays within maxDistance of where it came off', lim)

        # a piece bitten through breaks up too: the smaller part comes loose from it, and so on
        sp = await page.evaluate('''(q) => { const g = window.__dbg, pl = g.planet, fr = pl.fragments, N = pl.N;
              const f = fr.list[0], cells = fr.cellsOf(f), js = cells.map(c => ((c / N) | 0) % N).sort((a, b) => a - b);
              const cut = js[Math.floor(js.length * q)], before = f.count, ids = fr.list.map(x => x.id);
              const p0 = f.pos.clone();
              let eaten = 0; for (const c of cells) if (((c / N) | 0) % N === cut) { pl.remove(c); eaten++; }
              fr.step(true);
              const kids = fr.list.filter(x => !ids.includes(x.id));
              const k = kids[0];
              return { before, eaten, parent: f.dead ? 0 : f.count, kids: kids.map(x => x.count), id: k ? k.id : null,
                gap: k ? k.pos.distanceTo(f.pos) : 0, moved: f.pos.distanceTo(p0) }; }''', 0.3)
        t.ok(len(sp['kids']) == 1 and sp['kids'][0] < sp['parent'] and sp['kids'][0] + sp['parent'] == sp['before'] - sp['eaten'],
             'a piece cut through: the smaller part comes loose as a new piece', sp)
        sp2 = await page.evaluate('''() => { const fr = window.__dbg.planet.fragments; const f = fr.list[fr.list.length - 1];
          const p0 = f.pos.clone(); for (let n = 0; n < 60; n++) fr.step(true); return { moved: f.pos.distanceTo(p0), count: f.count }; }''')
        t.ok(sp2['moved'] > 0.05, 'the new piece drifts on its own', sp2)
        sp3 = await page.evaluate('''() => { const g = window.__dbg, pl = g.planet, fr = pl.fragments, f = fr.list[fr.list.length - 1], N = pl.N;
          const cells = fr.cellsOf(f), ks = cells.map(c => (c / (N * N)) | 0).sort((a, b) => a - b), cut = ks[Math.floor(ks.length * 0.6)];
          const n0 = fr.list.length, before = f.count; let eaten = 0;
          for (const c of cells) if (((c / (N * N)) | 0) === cut) { pl.remove(c); eaten++; }
          fr.step(true);
          return { pieces: fr.list.length - n0, before, eaten, left: f.dead ? 0 : f.count }; }''')
        t.ok(sp3['pieces'] == 1, '…and breaks up again when it is cut through', sp3)

        # a drone that hasn't eaten for 10 s stops for 0.5 s, then takes another bite
        rt = await page.evaluate('''() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet, c = g.cfg.swarm.retarget;
          p.onNewPlanet(); p.setSetting('count', 20);
          for (let n = 0; n < 400 && p.arrival.phase !== 'done'; n++) g.update(); // (out of the tunnel first)
          for (let n = 0; n < 5; n++) g.update();
          let i = -1; for (let k = 0; k < s.count; k++) if (s.food[k] >= 0 && !s.landed[k]) { i = k; break; }
          if (i < 0) return { found: false };
          const old = s.food[i]; s.hungry[i] = c.frames - 1;
          const at = [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]];
          g.update();
          const paused = s.pause[i];
          for (let n = 0; n < c.pauseFrames - 1; n++) g.update();
          const still = Math.hypot(s.pos[i * 3] - at[0], s.pos[i * 3 + 1] - at[1], s.pos[i * 3 + 2] - at[2]);
          g.update();
          return { found: true, paused, still, old, now: s.food[i], oldClaims: pl.claims[old], pauseLeft: s.pause[i] }; }''')
        t.ok(rt.get('found') and rt['paused'] == 30 and rt['still'] < 1e-6, 'a drone without a bite for 10 s stops for 0.5 s', rt)
        t.ok(rt['now'] != rt['old'] and rt['now'] >= 0 and rt['pauseLeft'] == 0, 'then it takes another bite (the old one is let go)', rt)

        # the boxes: eating in two boxes at once never makes one of them come loose;
        # cutting a 4×4×4 box between layers 1 and 2 frees the single layer, a 3×3×3 cut through the middle keeps both
        await page.evaluate(BUILD, BOXES)
        bx = await page.evaluate('''() => { const pl = window.__dbg.planet, N = pl.N, fr = pl.fragments;
          const box = new Map();
          for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) {
            const tg = pl.tags[idx]; (box.get(tg) || box.set(tg, []).get(tg)).push(idx); }
          const bySize = (n) => [...box.values()].find(c => c.length === n);
          // two corner voxels of two different boxes in one frame
          const a = bySize(64), b = bySize(27);
          pl.remove(bySize(48)[0]); pl.remove(bySize(36)[0]);
          fr.step(true);
          const apart = fr.list.length;
          // 4×4×4: eat the layer k = k0 + 2 → layers 0–1 (32) and layer 3 (16)
          const k0 = Math.min(...a.map(i => (i / (N * N)) | 0));
          for (const i of a) if (((i / (N * N)) | 0) === k0 + 2 && pl.hp[i] > 0) pl.remove(i);
          fr.step(true);
          const loose = fr.list.map(f => f.count);
          // 3×3×3: eat its middle layer → 9 and 9
          const k1 = Math.min(...b.map(i => (i / (N * N)) | 0));
          const before = fr.list.length;
          for (const i of b) if (((i / (N * N)) | 0) === k1 + 1 && pl.hp[i] > 0) pl.remove(i);
          fr.step(true);
          return { apart, loose, equal: fr.list.length - before }; }''')
        t.ok(bx['apart'] == 0, 'eating two separate boxes at once frees neither', bx)
        t.ok(bx['loose'] == [16], 'a 4×4×4 box cut into 32 + 16 voxels: the 16 come loose', bx['loose'])
        t.ok(bx['equal'] == 0, 'a 3×3×3 box cut through the middle (two parts of equal size): both stay', bx)

        # the swarm eats the planet, pieces included: the next planet comes only after the pieces are gone
        await page.evaluate('''() => { const g = window.__dbg, p = g.localPlayer;
          p.onNewPlanet(); p.setSetting('count', 100); p.setSetting('speed', 0.2); p.setSetting('power', 2); }''')
        seen_last = False
        for _ in range(60):
            await h.fast_forward(page, 200)
            st = await page.evaluate('''() => { const g = window.__dbg, fr = g.planet.fragments;
              return { level: g.level, alive: g.planet.alive, left: g.planet.left, frags: fr ? fr.list.length : 0,
                static: g.planet.count }; }''')
            if st['alive'] and st['frags'] > 0:
                seen_last = True
            if st['level'] > 1 or not st['alive']:
                break
        t.ok(seen_last, 'pieces drift while the swarm eats', st)
        t.ok(st['level'] > 1 or not st['alive'], 'the swarm chases and eats the drifting pieces too; then the planet is finished', st)

        # tugs: fly to a drifting piece, hold it with a tractor beam, tow it home; at the beacon the
        # piece is gone and the player gets 5 × its points (here only tugs, so nobody eats it on the way)
        await page.evaluate(BUILD, BOXES)
        tg = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, pl = g.planet, N = pl.N, fr = pl.fragments;
          p.onNewPlanet(); p.setSetting('count', 20); ['lasers', 'storms'].forEach(k => p.setSetting(k, 0)); p.setSetting('tugs', 20); p.setSetting('speed', 0.2);
          const box = new Map(); for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) { const t = pl.tags[idx]; (box.get(t) || box.set(t, []).get(t)).push(idx); }
          const a = [...box.values()].find(c => c.length === 64), k0 = Math.min(...a.map(i => (i / (N * N)) | 0));
          for (const i of a) if (((i / (N * N)) | 0) === k0 + 2) pl.remove(i);
          fr.step(true);
          return { piece: fr.list.map(f => f.count), score: p.score, left: pl.left, delivered: p.delivered || 0 }; }""")
        towed = False
        for _ in range(20):
            await h.fast_forward(page, 150)
            st = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, fr = g.planet.fragments;
              return { pieces: fr.list.length, tows: p.swarm.tows.length, towed: fr.list.some(f => f.towed), score: p.score, left: g.planet.left, delivered: p.delivered || 0 }; }""")
            towed = towed or st['towed']
            if st['delivered'] > tg['delivered']:
                break
        t.ok(tg['piece'] == [16] and towed, 'tugs catch a drifting piece with a tractor beam', st)
        t.ok(st['delivered'] == tg['delivered'] + 1 and st['pieces'] == 0 and st['score'] - tg['score'] == 5 * 16 and tg['left'] - st['left'] == 16,
             'towed home: the piece is gone and the player gets 5 × its points', {**st, 'before': tg})

        # a black hole pulls in a drifting piece within 15 voxels (gently) and swallows it: its voxels
        # count as eaten, a point each for the hole's owner
        await page.evaluate(BUILD, BOXES)
        bh = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, pl = g.planet, N = pl.N, fr = pl.fragments;
          p.onNewPlanet(); p.setSetting('count', 20); ['lasers', 'storms', 'tugs', 'bombers'].forEach(k => p.setSetting(k, 0)); g.stop();
          const box = new Map(); for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) { const t = pl.tags[idx]; (box.get(t) || box.set(t, []).get(t)).push(idx); }
          const a = [...box.values()].find(c => c.length === 64), k0 = Math.min(...a.map(i => (i / (N * N)) | 0));
          for (const i of a) if (((i / (N * N)) | 0) === k0 + 2) pl.remove(i);
          fr.step(true);
          const f = fr.list[0];
          const at = f.pos.clone().add(new window.THREE.Vector3(6, 0, 0)); // 12 voxels away
          g.holes.add(at, p);
          const d0 = f.pos.distanceTo(at), score0 = p.score, left0 = pl.left;
          let maxSpeed = 0, frames = 0;
          while (!f.dead && frames < 240) { g.holes.update(g.debris, fr, (x, o) => g.swallow(x, o)); fr.step(true); maxSpeed = Math.max(maxSpeed, f.vel.length()); frames++; }
          return { d0, swallowed: f.dead, frames, maxSpeed, gained: p.score - score0, eaten: left0 - pl.left, count: 16 }; }""")
        t.ok(bh['swallowed'] and bh['gained'] == 16 and bh['eaten'] == 16, 'a black hole pulls in a piece 12 voxels away and swallows it (points for its owner)', bh)
        t.ok(bh['maxSpeed'] <= 0.0501 and bh['frames'] > 60, 'gently: it takes over a second', bh)

        # cleaners (grey): eat only drifting pieces of at most 3 voxels — not bigger pieces, not the planet
        await page.evaluate(BUILD, BOXES)
        cl = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, pl = g.planet, fr = pl.fragments;
          p.onNewPlanet(); p.setSetting('count', 20);
          ['lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports'].forEach(k => p.setSetting(k, 0)); p.setSetting('cleaners', 20); p.setSetting('speed', 0.2);
          const box = new Map(); for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) { const t = pl.tags[idx]; (box.get(t) || box.set(t, []).get(t)).push(idx); }
          const small = [...box.values()].find(c => c.length === 3), big = [...box.values()].find(c => c.length === 4);
          const fs = fr.create(small), fb = fr.create(big);
          p.swarm.render(g.camera);
          const c = p.swarm.mesh.instanceColor, grey = Math.abs(c.getX(0) - c.getZ(0)) < 0.15 && c.getX(0) > 0.45 && c.getX(0) < 0.8;
          return { small: fs.id, big: fb.id, grey, cleaners: p.swarm.cleaners, staticLeft: pl.left - 7, left: pl.left }; }""")
        st = None
        for _ in range(30):
            await h.fast_forward(page, 150)
            st = await page.evaluate("""(ids) => { const g = window.__dbg, pl = g.planet, fr = pl.fragments, s = g.localPlayer.swarm;
              const f = (id) => fr.byId.get(id);
              let biteOnPlanet = 0; for (let i = 0; i < s.count; i++) if (s.food[i] >= 0 && fr.fragOf[s.food[i]] < 0) biteOnPlanet++;
              return { smallLeft: f(ids[0]) && !f(ids[0]).dead ? f(ids[0]).count : 0, bigLeft: f(ids[1]) && !f(ids[1]).dead ? f(ids[1]).count : 0,
                left: pl.left, biteOnPlanet, out: [...s.hidden.subarray(0, s.count)].filter(x => !x).length }; }""", [cl['small'], cl['big']])
            if st['smallLeft'] == 0:
                break
        t.ok(cl['grey'] and cl['cleaners'] == 20, 'cleaners are grey', cl)
        t.ok(st['smallLeft'] == 0 and st['out'] > 0, 'cleaners eat a drifting piece of 3 voxels', st)
        await h.fast_forward(page, 600)
        st2 = await page.evaluate("""(id) => { const g = window.__dbg, pl = g.planet, fr = pl.fragments, s = g.localPlayer.swarm, f = fr.byId.get(id);
          let biteOnPlanet = 0; for (let i = 0; i < s.count; i++) if (s.food[i] >= 0 && fr.fragOf[s.food[i]] < 0) biteOnPlanet++;
          return { bigLeft: f && !f.dead ? f.count : 0, left: pl.left, biteOnPlanet }; }""", cl['big'])
        t.ok(st2['bigLeft'] == 4 and st2['left'] == cl['left'] - 3 and st2['biteOnPlanet'] == 0,
             'but not a piece of 4 voxels, nor the planet', {**st2, 'before': cl})

        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
