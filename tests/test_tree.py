"""Points and the upgrade tree: 1 voxel = 1 point, buying nodes (parents first, enough
points), bonuses on top of the sliders, chain lightning weakening voxels, the destruction
animation, and the Tab view.

Run from the repository root:  python tests/test_tree.py
Set SHOTS=<folder> to save screenshots of the tree and of a lightning bolt."""

import asyncio
import os
import sys

from playwright.async_api import async_playwright

import harness as h

STATE = """() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm;
  return { score: p.score, points: p.points, spent: p.tree.spent, count: s.count, speed: s.speed, power: p.biteRadius,
    base: p.base, bolts: g.lightning.shown, owned: [...p.tree.owned],
    shown: document.getElementById('points').querySelector('.points-value').textContent }; }"""


async def main():
    h.check_setup()
    url = h.start_static_server()
    shots = os.environ.get('SHOTS')
    t = h.Checks('test_tree')
    errors = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=h.BROWSER_ARGS)
        page = await h.open_page(browser, url, errors, 'tree')
        await page.click('.menu-choice >> nth=0')
        await page.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('count', 100); p.setSetting('speed', 0.3); }")
        await h.fast_forward(page, 600)
        await page.evaluate('() => window.__dbg.updateHud()')
        s = await page.evaluate(STATE)
        t.ok(s['score'] > 0 and s['points'] == s['score'], '1 eaten voxel = 1 point', s['score'])
        t.ok(s['shown'].replace(',', '') == str(s['points']), 'points counter at the top shows them', s['shown'])

        # the tree opens with Tab
        await page.keyboard.press('Tab')
        t.ok(await page.locator('#tree').is_visible(), 'Tab opens the upgrade tree')
        await page.wait_for_timeout(400)
        pix = await page.evaluate("() => { const c = document.querySelector('.tree-canvas'); return [c.width, c.height, getComputedStyle(c).imageRendering]; }")
        t.ok(pix[0] < 500 and pix[2] in ('pixelated', 'crisp-edges'), 'drawn small and scaled up without smoothing (pixel art)', pix)

        # buying: parents first, enough points
        r = await page.evaluate("() => { const g = window.__dbg, p = g.localPlayer; p.score = 100;"
                                " return [g.buyUpgrade('units2'), g.buyUpgrade('units1'), g.buyUpgrade('units1')]; }")
        t.ok(r == [False, True, False], 'a node needs its parent and is bought once', r)
        s = await page.evaluate(STATE)
        t.ok(s['count'] == s['base']['count'] + 10 and s['spent'] == 40 and s['points'] == s['score'] - 40,
             'Brood I: +10 units on top of the slider, 40 points spent', s)
        t.ok(not await page.evaluate("() => window.__dbg.buyUpgrade('units2')"), 'not enough points: no purchase')
        await page.evaluate("() => { const g = window.__dbg, p = g.localPlayer; p.score += 2000;"
                            " ['speed1', 'speed2', 'power1', 'bolt1', 'arcs1', 'cap1', 'volt1'].forEach(id => g.buyUpgrade(id)); }")
        s = await page.evaluate(STATE)
        t.ok(abs(s['speed'] - s['base']['speed'] * 1.2) < 1e-9, 'Wings I+II: +20% speed', s['speed'])
        t.ok(abs(s['power'] - (s['base']['power'] + 0.2)) < 1e-9, 'Jaws I: +0.2 bite radius', s['power'])
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('speed', 0.4)")
        s = await page.evaluate(STATE)
        t.ok(abs(s['speed'] - 0.48) < 1e-9, 'moving a slider keeps the bonus on top', s['speed'])
        if shots:
            await page.mouse.move(500, 300)
            await page.wait_for_timeout(500)
            await page.screenshot(path=os.path.join(shots, 'tree.png'))
        await page.keyboard.press('Escape')
        t.ok(await page.locator('#tree').is_hidden(), 'Esc closes it')

        # chain lightning: fires on its own, weakens voxels (never destroys them by itself)
        before = await page.evaluate('() => window.__dbg.lightning.shown')
        bolt = await page.evaluate('() => window.__dbg.localPlayer.bolt')
        await h.fast_forward(page, int(bolt['interval'] * 60 * 2 + 30))
        s = await page.evaluate(STATE)
        t.ok(s['bolts'] >= before + 2, f"lightning every {bolt['interval']} s on its own", s['bolts'] - before)
        hit = await page.evaluate("""() => { const pl = window.__dbg.planet, p = window.__dbg.localPlayer, s = p.swarm;
          const path = [];
          for (let i = 0; i < 4; i++) { const idx = pl.idxOfSlot[i * 50]; const c = pl.cellCenter(idx, new window.THREE.Vector3()); path.push(c.x, c.y, c.z); }
          const left = pl.left; const n = pl.weakenAlong(path, 0.5);
          let weak = 0; for (let i = 0; i < pl.hp.length; i++) if (pl.hp[i] > 0 && pl.hp[i] < 1) weak++;
          return { n, weak, sameLeft: pl.left === left }; }""")
        t.ok(hit['n'] > 0 and hit['weak'] > 0 and hit['sameLeft'], 'a bolt weakens the voxels on its way without destroying them', hit)
        scale = await page.evaluate("""() => { const pl = window.__dbg.planet; const m = new window.THREE.Matrix4(), v = new window.THREE.Vector3();
          for (let i = 0; i < pl.hp.length; i++) if (pl.hp[i] > 0 && pl.hp[i] < 0.9 && pl.slotOf[i] >= 0) {
            pl.mesh.getMatrixAt(pl.slotOf[i], m); v.setFromMatrixScale(m); return v.x; } return 1; }""")
        t.ok(scale < 1, 'destruction animation: a damaged voxel is drawn smaller', round(scale, 2))

        if shots:
            await page.evaluate("""() => { const g = window.__dbg; g.orbit.distance = 50; g.updateCamera();
              const p = g.localPlayer; p.boltClock = 99; p.updateLightning(); }""")
            await page.evaluate("() => { const g = window.__dbg; g.renderer.render(g.scene, g.camera); }")
            await page.screenshot(path=os.path.join(shots, 'bolt.png'))
        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
