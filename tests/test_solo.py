"""Single player: start screen, Esc menu, eating a whole planet, the jump to hyperspace, next planet
arriving through the tunnel.

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
    if (pl.alive && pl.isSolid({ x: s.pos[i * 3], y: s.pos[i * 3 + 1], z: s.pos[i * 3 + 2] })) { inside++; (window.__inside ||= []).push([g.frameNo, i, ['lasers','storms','tugs','bombers','orbs','supports','cleaners','drills','piercers'].find((k) => s.isKind(i, k)) || 'eater', s.landed[i], s.food[i], s.hidden[i], s.pierceOn[i], s.drillLeft[i]]); }
    const f = s.food[i];
    if (f >= 0) { if (seen.has(f)) shared++; seen.add(f); }
  }
  return { started: g.started, level: g.level, left: pl.left, total: pl.total, alive: pl.alive,
    score: p.score, home: p.homeMode, inside, shared, cx: c.x, spin: g.spin };
}"""


# a ship that has landed is turned away from its bite: it must face it again before eating
AIM = """(laser) => { const g = window.__dbg, s = g.localPlayer.swarm, pl = g.planet;
            const pick = () => { for (let k = laser ? 0 : s.lasers + s.storms + s.tugs + s.bombers + s.orbs + s.supports; k < (laser ? s.lasers : s.count); k++) if (s.landed[k] && s.food[k] >= 0 && s.aimed[k] && pl.solid(s.food[k]) && pl.strengthOf(s.food[k]) > 0.5) return k; return -1; };
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
        choices = await page.locator('.menu-choice:not(.menu-settings)').all_inner_texts()
        t.ok(len(choices) == 3 and 'Single player' in choices[0], 'start screen offers 3 modes', choices)

        # Settings: Mouse, Keyboard, Graphics; they apply at once and Back / Esc returns
        await page.click('.menu-settings')
        st = await page.evaluate("""() => ({ title: document.getElementById('menu-title').textContent,
          sections: [...document.querySelectorAll('.settings-title')].map((e) => e.textContent),
          keys: [...document.querySelectorAll('.settings-keys dt')].map((e) => e.textContent) })""")
        t.ok(st['title'] == 'Settings' and st['sections'] == ['Mouse', 'Keyboard', 'Graphics'] and 'Tab' in st['keys'] and 'Space' in st['keys'],
             'Settings: Mouse, Keyboard (Tab, Space, Esc …) and Graphics', st)
        gr = await page.evaluate("""async () => { const g = window.__dbg, q = (s) => document.querySelector(s);
          const canvas0 = g.canvas;
          q('input[data-setting=fps]').click();
          q('button[data-setting=resolution][data-value="0.5"]').click();
          q('button[data-setting=effects][data-value=low]').click();
          q('input[data-setting=antialias]').click();
          const r = q('input[data-setting=rotateSpeed]'); r.value = 2; r.dispatchEvent(new Event('input'));
          await new Promise((res) => setTimeout(res, 700));
          return { fps: !q('#fps').hidden && /FPS$/.test(q('#fps').textContent), ratio: g.renderer.getPixelRatio(),
            effects: g.debris.scale, aa: g.renderer.getContextAttributes().antialias, newCanvas: g.canvas !== canvas0 && document.body.contains(g.canvas) && !document.body.contains(canvas0),
            saved: JSON.parse(localStorage.getItem('hive-hunger-settings') || '{}') }; }""")
        t.ok(gr['fps'] and gr['ratio'] == 0.5 and gr['effects'] == 0.2 and gr['aa'] is False and gr['newCanvas'],
             'graphics: FPS counter, resolution, effects and smooth edges apply at once', gr)
        t.ok(gr['saved'].get('rotateSpeed') == 2 and gr['saved'].get('resolution') == 0.5, 'settings are remembered in the browser', gr['saved'])
        await page.keyboard.press('Escape')
        t.ok(await page.locator('.menu-choice >> nth=0').inner_text() != '' and (await page.inner_text('#menu-title')).startswith('Hive Hunger'), 'Esc goes back from Settings')
        await page.click('.menu-settings')
        await page.click('.settings-buttons button >> nth=0')  # Reset settings
        rs = await page.evaluate("() => ({ ratio: window.__dbg.renderer.getPixelRatio(), aa: window.__dbg.renderer.getContextAttributes().antialias, fps: document.getElementById('fps').hidden })")
        await page.click('.settings-buttons button >> nth=1')  # Back
        t.ok(rs['aa'] and rs['fps'] and rs['ratio'] == 1, 'Reset settings restores them (native resolution, smooth edges, no FPS counter)', rs)
        start_ships = await page.evaluate("""() => ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers'].map((k) => +document.getElementById('ships-' + k).value)""")
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
        ui_text = await page.evaluate("() => ({ hint: document.querySelector('.hud-hint')?.textContent || '', points: document.getElementById('points').textContent })")
        t.ok(ui_text['hint'] == '' and 'Tab' not in ui_text['points'], 'no description of the controls on the game screen, no "Tab: upgrades"', ui_text)
        # the camera turns any way round: dragging down a long way takes it over the pole
        await page.mouse.move(500, 150)
        await page.mouse.down(button='right')
        ys = []
        for k in range(1, 13):
            await page.mouse.move(500, 150 + k * 40)
            ys.append(await page.evaluate("() => { const c = window.__dbg.camera; return Math.round(100 * c.position.y / c.position.length()) / 100; }"))
        await page.mouse.up(button='right')
        t.ok(max(ys) > 0.95 and ys[-1] < max(ys) - 0.3 and ys[-1] > -1, 'the camera turns up over the pole (no vertical limit)', ys)

        labels = await page.locator('#controls .control label').all_inner_texts()
        t.ok(labels == ['Units', 'Speed', 'Power', 'Turning'], 'settings panel: Units, Speed, Power, Turning (eating the nearest voxel is always on)', labels)

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
        ui = await page.evaluate("""() => ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers'].map((k) => +document.getElementById('ships-' + k).value)""")
        t.ok(start_ships == [2] * 10, 'ship types at the start: 2 of each', start_ships)
        # (no bombers for the next checks: they would blow up meanwhile)
        await page.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('count', 20); p.setSetting('bombers', 0); p.setSetting('orbs', 0); p.setSetting('supports', 0); p.setSetting('cleaners', 0); p.setSetting('drills', 0); p.setSetting('piercers', 0); p.setSetting('storms', 3); p.setSetting('tugs', 3); }")
        await page.wait_for_timeout(400)
        ui = await page.evaluate("""() => ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers'].map((k) => +document.getElementById('ships-' + k).value)""")
        await page.click('.control-levels button >> nth=1')
        await page.evaluate("""() => { const e = document.getElementById('ships-lasers'); e.value = 8; e.dispatchEvent(new Event('input'));
          window.__dbg.localPlayer.setSetting('speed', 0.3); }""")
        await page.wait_for_timeout(400)
        ui = await page.evaluate("""() => ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers'].map((k) => +document.getElementById('ships-' + k).value)""")
        t.ok(ui == [6, 8, 3, 3, 0, 0, 0, 0, 0, 0], 'the sliders are linked: 8 lasers take 5 eaters', ui)
        ui2 = await page.evaluate("""() => { const e = document.getElementById('ships-eaters'); e.value = 15; e.dispatchEvent(new Event('input')); return 0; }""")
        ui2 = await page.evaluate("""() => ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers'].map((k) => +document.getElementById('ships-' + k).value)""")
        t.ok(ui2 == [15, 5, 0, 0, 0, 0, 0, 0, 0, 0], '15 eaters take the last types first (orbs, bombers, tugs, storm ships), then lasers', ui2)
        # a locked slider stays put: lock Eaters and Lasers, move Storms up — it takes only from the unlocked ones
        lk = await page.evaluate("""() => { const set = (k, v) => { const e = document.getElementById('ships-' + k); e.value = v; e.dispatchEvent(new Event('input')); };
          set('lasers', 5); set('storms', 3); set('tugs', 3); set('bombers', 2); // 7 eaters
          for (const k of ['eaters', 'lasers']) { const b = document.getElementById('ships-lock-' + k); b.checked = true; b.dispatchEvent(new Event('change')); }
          set('storms', 6); // +3: from bombers (2), then tugs (1) — not the locked eaters or lasers
          const r = ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers'].map((k) => +document.getElementById('ships-' + k).value);
          const disabled = document.getElementById('ships-eaters').disabled;
          for (const k of ['eaters', 'lasers']) { const b = document.getElementById('ships-lock-' + k); b.checked = false; b.dispatchEvent(new Event('change')); }
          set('tugs', 0); set('bombers', 0); set('storms', 0); set('lasers', 5);
          return { r, disabled }; }""")
        t.ok(lk['r'] == [7, 5, 6, 2, 0, 0, 0, 0, 0, 0] and lk['disabled'], 'a locked slider stays put (moving another takes from the unlocked ones)', lk)
        # the arrows next to a slider: one ship more / fewer (from / to the eaters)
        ar = await page.evaluate("""() => { const v = () => ['eaters', 'lasers'].map((k) => +document.getElementById('ships-' + k).value);
          const row = document.querySelector('.ships-lasers'), before = v();
          row.querySelector('.ships-more').click(); row.querySelector('.ships-more').click(); const up = v();
          row.querySelector('.ships-less').click(); const down = v();
          return { before, up, down, setting: window.__dbg.localPlayer.getSetting('lasers') }; }""")
        t.ok(ar['up'] == [ar['before'][0] - 2, ar['before'][1] + 2] and ar['down'] == [ar['before'][0] - 1, ar['before'][1] + 1] and ar['setting'] == ar['before'][1] + 1,
             'the arrows move a ship-type slider by one', ar)
        await page.evaluate("""() => { const e = document.getElementById('ships-lasers'); e.value = 8; e.dispatchEvent(new Event('input'));
          const st = document.getElementById('ships-storms'); st.value = 1; st.dispatchEvent(new Event('input')); }""")
        sp = await page.evaluate("""() => { const g = window.__dbg, s = g.localPlayer.swarm;
          // (the ships come out of the tunnel first)
          for (let n = 0; n < 400 && g.localPlayer.arrival.phase !== 'done'; n++) g.update();
          g.update();
          const before = Array.from(s.pos); g.update();
          const step = (i) => Math.hypot(s.pos[i * 3] - before[i * 3], s.pos[i * 3 + 1] - before[i * 3 + 1], s.pos[i * 3 + 2] - before[i * 3 + 2]);
          const L = [], E = []; for (let i = 0; i < s.count; i++) (i < s.lasers ? L : E).push(step(i)); // storm ships fly at full speed
          return { laser: Math.max(...L), eater: Math.max(...E) }; }""")
        t.ok(abs(sp['laser'] - 0.27) < 0.005 and abs(sp['eater'] - 0.3) < 0.005, 'laser ships fly 10% slower', sp)
        await h.fast_forward(page, 500)
        lz = await page.evaluate("""() => { const g = window.__dbg, s = g.localPlayer.swarm; s.render(g.camera);
          const d = (i) => { const i3 = i * 3; return Math.hypot(s.pos[i3] - s.foodPos[i3], s.pos[i3 + 1] - s.foodPos[i3 + 1], s.pos[i3 + 2] - s.foodPos[i3 + 2]); };
          const L = [], E = []; for (let i = 0; i < s.count; i++) if (s.landed[i] && s.food[i] >= 0 && !s.isStorm(i) && !s.isOrb(i)) (i < s.lasers ? L : E).push(d(i));
          const red = s.mesh.instanceColor.getX(0) > 0.9 && s.mesh.instanceColor.getY(0) < 0.5, yellow = s.mesh.instanceColor.getX(s.count - 1) > 0.9 && s.mesh.instanceColor.getZ(s.count - 1) < 0.5;
          return { laser: L.length ? Math.min(...L) : 0, eater: E.length ? Math.max(...E) : 9, beams: s.beamCount, red, yellow }; }""")
        t.ok(lz['laser'] > 1.5 and lz['eater'] < 1.5 and lz['beams'] > 0, 'laser ships eat from a distance (with a beam), eaters up close', lz)
        t.ok(lz['red'] and lz['yellow'], 'laser ships are red, eaters yellow', lz)
        # storm ship: from laser range, a forked bolt — 40% of a laser's damage on the bite, 30% on each of the two nearest voxels
        st = await page.evaluate("""() => { const g = window.__dbg, s = g.localPlayer.swarm, pl = g.planet, i = s.lasers;
          const blue = s.mesh.instanceColor.getZ(i) > 0.9 && s.mesh.instanceColor.getX(i) < 0.7;
          const ready = () => s.landed[i] && s.aimed[i] && s.food[i] >= 0 && pl.strengthOf(s.food[i]) > 0.3 && ((n) => n.length === 2 && n.every((x) => pl.strengthOf(x) > 0.3))(pl.nearestAround(s.food[i], 2, s.food[i]));
          let f = 0; while (!ready() && f < 900) { g.update(); f++; }
          if (!ready()) return { found: false, blue };
          const c = s.food[i], sides = pl.nearestAround(c, 2, c), hp = (x) => pl.strengthOf(x);
          const c0 = hp(c), s0 = sides.map(hp), shown = s.stormBolts.shown;
          const pos = [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]], fp = [s.foodPos[i * 3], s.foodPos[i * 3 + 1], s.foodPos[i * 3 + 2]];
          g.update(); for (let n = 0; n < 4; n++) s.render(g.camera);
          const total = (g.cfg.planet.strength / g.cfg.swarm.eatFrames) * 7; // power 0.5 → a 7-voxel crater
          return { found: true, blue, dist: Math.hypot(pos[0] - fp[0], pos[1] - fp[1], pos[2] - fp[2]), sides: sides.length,
            centre: c0 - hp(c), side: sides.map((x, k) => s0[k] - hp(x)), want: [total * 0.4, total * 0.3], bolts: s.stormBolts.shown - shown }; }""")
        t.ok(st.get('blue'), 'the storm ship is blue', st)
        t.ok(st.get('found') and st['dist'] > 1.5 and st['sides'] == 2 and abs(st['centre'] - st['want'][0]) < 1e-4
             and all(x >= st['want'][1] - 1e-4 for x in st['side']),
             'a storm ship hits its bite (40%) and the two nearest voxels (30% each) from laser range', st)
        t.ok(st.get('bolts', 0) == 3, 'its lightning forks into three bolts', st)
        # bomber: flies to the nearest voxel, blows up everything within 10 voxels and dies for good;
        # a black hole opens for ~4 s (1 s growing, 2 s, 1 s shrinking), bending the picture
        bm = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet;
          p.setSetting('bombers', 1);
          const count0 = s.count, base0 = p.base.count, made0 = g.holes.made, left0 = pl.left, purple = s.mesh.instanceColor;
          s.render(g.camera);
          const i = s.lasers + s.storms + s.tugs, colour = [purple.getX(i), purple.getY(i), purple.getZ(i)];
          let f = 0; while (g.holes.made === made0 && f < 2000) { g.update(); f++; }
          if (g.holes.made === made0) return { exploded: false };
          const h = g.holes.holes[g.holes.holes.length - 1], R = g.cfg.swarm.bomber.radius - pl.s, v = new window.THREE.Vector3();
          let inside = 0;
          for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0 && pl.gridCenter(idx, v).distanceTo(h.pos) < R) inside++;
          g.holes.render(g.renderer, g.scene, g.camera); // the lens pass draws
          for (let n = 0; n < 100; n++) g.update();
          const mid = g.holes.strength(h);
          for (let n = 0; n < 160; n++) g.update();
          return { exploded: true, count: s.count, count0, base: p.base.count, base0, bombers: p.bombers, destroyed: left0 - pl.left, inside,
            purple: colour[0] > 0.6 && colour[2] > 0.9 && colour[1] < 0.6, mid, gone: !g.holes.holes.includes(h) }; }""")
        t.ok(bm.get('exploded') and bm['purple'], 'a purple bomber flies to the planet and blows up', bm)
        t.ok(bm.get('destroyed', 0) > 1000 and bm.get('inside') == 0, 'everything within 10 voxels of it is gone', bm)
        t.ok(bm.get('count') == bm.get('count0', 0) - 1 and bm.get('base') == bm.get('base0', 0) - 1 and bm.get('bombers') == 0,
             'the bomber is gone for good (one unit fewer)', bm)
        t.ok(bm.get('mid') == 1 and bm.get('gone'), 'its black hole is at full size after ~1.5 s and gone after 4 s', bm)
        await page.wait_for_timeout(500)
        units = await page.evaluate("() => [+document.querySelector('#ctl-count + output').value, +document.getElementById('ships-bombers').value]")
        t.ok(units == [bm.get('base'), 0], 'the panel shows one unit fewer', units)
        await page.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('count', 20); }")
        # orb ship: from 10 voxels away it fires a slow, voxel-sized orb with a pulsing glow (one at a
        # time); where it bursts, everything within 2 voxels is gone
        ob = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet;
          p.setSetting('orbs', 1);
          const fired0 = g.orbs.fired;
          let f = 0; while (g.orbs.fired === fired0 && f < 2000) { g.update(); f++; }
          if (g.orbs.fired === fired0) return { fired: false };
          const o = g.orbs.list[g.orbs.list.length - 1], i = o.unit;
          s.render(g.camera);
          const ic = s.mesh.instanceColor, magenta = ic.getX(i) > 0.9 && ic.getY(i) < 0.5 && ic.getZ(i) > 0.7;
          const start = o.group.position.clone(), dist = start.distanceTo(o.to);
          const g0 = o.glow.scale.x;
          g.update();
          const tail = g.orbs.tail.n;
          const step = o.group.position.distanceTo(start), g1 = o.glow.scale.x;
          // one at a time: while it flies the ship doesn't fire another
          let more = 0; for (let n = 0; n < 20 && !o.done; n++) { const k = g.orbs.fired; g.update(); if (g.orbs.list.some((x) => x !== o && x.unit === i) || (g.orbs.fired > k && !o.done && g.orbs.list[g.orbs.list.length - 1].unit === i)) more++; }
          let n = 0; while (!o.done && n < 400) { g.update(); n++; }
          const v = new window.THREE.Vector3(), R = g.cfg.swarm.orb.blast - pl.s * 0.5;
          let inside = 0; for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0 && pl.gridCenter(idx, v).distanceTo(o.to) < R) inside++;
          return { fired: true, magenta, dist, step, pulse: g0 !== g1, tail, more, burst: o.done, inside, out: s.orbOut[i] }; }""")
        t.ok(ob.get('fired') and ob['magenta'] and ob['dist'] < 5.8, 'a magenta orb ship fires an orb from up to 10 voxels away', ob)
        t.ok(ob.get('step', 0) < 0.06 and ob.get('pulse') and ob.get('tail', 0) > 0, 'the orb flies slowly, its glow pulses, a fiery tail behind it', ob)
        t.ok(ob.get('more') == 0 and ob.get('burst') and ob.get('inside') == 0 and ob.get('out') == 0,
             'one orb at a time; where it bursts everything within 2 voxels is gone', ob)
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('orbs', 0)")
        # support ship: a lightning bolt that runs between ships of its swarm (random order) over 1.5 s,
        # destroying the voxels on its way; bent, branched, white
        zp = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet;
          p.setSetting('supports', 1);
          const i = s.lasers + s.storms + s.tugs + s.bombers + s.orbs;
          s.render(g.camera);
          const ic = s.mesh.instanceColor, white = ic.getX(i) > 0.9 && ic.getY(i) > 0.9 && ic.getZ(i) > 0.9;
          const made0 = g.zaps.made;
          let f = 0; while (g.zaps.made === made0 && f < 400) { g.update(); f++; }
          if (g.zaps.made === made0) return { fired: false, white };
          const b = g.zaps.list[g.zaps.list.length - 1];
          const chain = [b.segs[0].a, ...b.segs.map((x) => x.b)];
          const distinct = new Set(chain).size === chain.length && chain[0] === i;
          // a bolt sent into the planet: unit j is put inside it, the voxels on the way are gone
          g.stop();
          const j = chain[1], c = pl.cellCenter(pl.idxOfSlot[0], new window.THREE.Vector3());
          const inner = c.clone().multiplyScalar(0.8);
          s.pos[j * 3] = inner.x; s.pos[j * 3 + 1] = inner.y; s.pos[j * 3 + 2] = inner.z;
          s.pos[i * 3] = c.x * 1.2; s.pos[i * 3 + 1] = c.y * 1.2; s.pos[i * 3 + 2] = c.z * 1.2;
          const left0 = pl.left, score0 = p.score;
          g.zap(p, [i, j], 12345);
          const zb = g.zaps.list[g.zaps.list.length - 1];
          let half = -1, frames = 0;
          for (; zb.age < g.cfg.swarm.support.life && frames < 200; frames++) {
            g.zaps.update(g.camera);
            if (frames === 30) half = zb.main.light.filter((l) => l > 0).length / zb.main.light.length;
          }
          const branches = zb.branches.length, glow = [zb.main.glowPx, zb.branchMeshes[0]?.glowPx];
          return { fired: true, white, chain: chain.length, distinct, destroyed: left0 - pl.left, gained: p.score - score0, half, frames, branches, glow,
            gone: !g.zaps.list.includes(zb) }; }""")
        t.ok(zp.get('fired') and zp['white'] and zp['distinct'] and zp['chain'] >= 2, 'a white support ship fires lightning that jumps between ships of its swarm', zp)
        t.ok(zp.get('destroyed', 0) > 0 and zp['destroyed'] == zp['gained'], 'what lies on its way is destroyed (a point each)', zp)
        t.ok(0 < zp.get('half', 0) < 1 and zp.get('gone') and 85 <= zp.get('frames', 0) <= 95, 'it runs from ship to ship and is gone after 1.5 s', zp)
        t.ok(zp.get('branches', 0) > 0 and zp.get('glow') == [4, 2], 'with branches; glow 4 px on the bolt, 2 px on the branches', zp)
        await page.evaluate("() => { const g = window.__dbg; g.localPlayer.setSetting('supports', 0); }")
        # drill: lands on the nearest voxel, then drills straight in towards the centre with a turning
        # orange spiral bit, eating everything around it; through, it flies on as usual
        dr = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet;
          p.setSetting('drills', 2);
          const a = s.kindStart('drills'); s.render(g.camera);
          const ic = s.mesh.instanceColor, orange = ic.getX(a) > 0.9 && ic.getY(a) > 0.4 && ic.getY(a) < 0.7 && ic.getZ(a) < 0.3;
          let f = 0; while (!(s.drillLeft[a] > 0 || s.drillLeft[a + 1] > 0) && f < 1500) { g.update(); f++; }
          const i = s.drillLeft[a] > 0 ? a : a + 1;
          if (!(s.drillLeft[i] > 0)) return { drilled: false, orange };
          const r0 = Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]), left0 = pl.left;
          s.render(g.camera); const bit = (s.drillBits || []).find((b) => b.visible), spin0 = bit ? bit.children[0].rotation.z : 0;
          let r1 = r0; // the deepest it got
          for (let k = 0; k < 60 && s.drillLeft[i] > 0; k++) { g.update(); r1 = Math.min(r1, Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2])); }
          s.render(g.camera);
          let through = false; for (let k = 0; k < 1500 && !through; k++) { g.update(); through = s.drillLeft[i] === 0; }
          return { drilled: true, orange, deeper: r0 - r1, eaten: left0 - pl.left, bit: Boolean(bit), spun: bit ? bit.children[0].rotation.z !== spin0 : false, through }; }""")
        t.ok(dr.get('drilled') and dr['orange'] and dr['deeper'] > 1.5 and dr['eaten'] > 10, 'an orange drill drills straight into the planet, eating everything around it', dr)
        t.ok(dr.get('bit') and dr.get('spun'), 'with a turning spiral bit at its nose', dr)
        t.ok(dr.get('through'), 'and stops once through', dr)
        await page.evaluate("() => { const g = window.__dbg; g.localPlayer.setSetting('drills', 0); }")
        # piercer: from 20 voxels an orange beam with a yellow spiral lightning round it, through 3
        # voxels in a row at once, each a little slower than an eater eats
        pc = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet;
          p.setSetting('piercers', 2);
          const a = s.kindStart('piercers'); s.render(g.camera);
          // both piercers 8 units above the surface, without a bite: they fire from where they are
          for (const k of [a, a + 1]) { const l = Math.hypot(s.pos[k*3], s.pos[k*3+1], s.pos[k*3+2]) || 1, R = pl.R + 8;
            for (let m = 0; m < 3; m++) s.pos[k*3+m] *= R / l;
            if (s.food[k] >= 0) pl.release(s.food[k]); s.food[k] = -1; s.landed[k] = 0; }
          const ic = s.mesh.instanceColor, copper = ic.getX(a) > 0.6 && ic.getY(a) > 0.3 && ic.getY(a) < 0.55 && ic.getZ(a) < 0.35;
          // aimed at its bite, it locks the line through it and fires along it
          let f = 0, i = -1; while (i < 0 && f < 2000) { g.update(); f++; for (const k of [a, a + 1]) if (s.pierceOn[k]) { i = k; break; } }
          if (i < 0) return { fired: false, copper };
          const c = g.cfg.swarm.piercer, T = window.THREE;
          const P = new T.Vector3(s.pos[i*3], s.pos[i*3+1], s.pos[i*3+2]), d = new T.Vector3(s.pierceDir[i*3], s.pierceDir[i*3+1], s.pierceDir[i*3+2]);
          // the first 3 voxels on the line
          const line = () => { const row = [], q = P.clone(); for (let k = 0; k < c.length / (pl.s * 0.5) && row.length < c.pierce; k++) { q.addScaledVector(d, pl.s * 0.5); const n = pl.cellAt(q); if (n >= 0 && pl.hp[n] > 0 && !row.includes(n) && !pl.claimedByOther(n, -1)) row.push(n); } return row; };
          const row = line(), dist = row.length ? pl.cellCenter(row[0], new T.Vector3()).distanceTo(P) : 0;
          const before = row.map((n) => pl.strengthOf(n)), shown = s.piercerBolts.shown;
          g.update(); for (let k = 0; k < 4; k++) s.render(g.camera);
          const lost = row.map((n, k) => before[k] - pl.strengthOf(n));
          const eater = g.cfg.planet.strength / g.cfg.swarm.eatFrames;
          const orange = s.piercerBeamCount > 0, spirals = s.piercerBolts.shown - shown;
          // it fires until it is through, then 2 s more, then switches off
          let lastHit = 0, off = -1, still = true;
          for (let k = 1; k < 20000 && off < 0; k++) {
            g.update();
            if (s.pierceOn[i] && s.pierceAfter[i] === 0) lastHit = k;
            if (s.pierceOn[i] && Math.hypot(s.pos[i*3] - P.x, s.pos[i*3+1] - P.y, s.pos[i*3+2] - P.z) > 1e-6) still = false;
            if (!s.pierceOn[i]) off = k;
          }
          const through = line().length === 0;
          // then it goes on: a new bite (flying to it, or from here if it is in range) and a new line
          let next = false;
          for (let k = 0; k < 600 && !next; k++) { g.update(); next = s.food[i] >= 0 || (s.pierceOn[i] && s.pierceDir[i*3] * d.x + s.pierceDir[i*3+1] * d.y + s.pierceDir[i*3+2] * d.z < 0.9999); }
          return { fired: true, copper, dist, row: row.length, lost, want: eater * c.damage, orange, spirals, after: off - lastHit, through, still, next }; }""")
        t.ok(pc.get('fired') and pc['copper'] and pc['dist'] > 4, 'a copper piercer fires from a distance (up to 20 voxels)', pc)
        t.ok(pc.get('row') == 3 and all(abs(x - pc['want']) < 1e-4 for x in pc['lost']), 'its beam goes through 3 voxels in a row and eats them at once (0.8 × an eater)', pc)
        t.ok(pc.get('orange') and pc.get('spirals', 0) > 0, 'an orange beam with a yellow spiral lightning round it', pc)
        t.ok(pc.get('through') and pc.get('still') and 118 <= pc.get('after', 0) <= 122, 'it fires along the locked line until it is through, then 2 s more, staying put', pc)
        t.ok(pc.get('next'), 'then it switches off and goes on to its next bite', pc)
        await page.evaluate("() => { const g = window.__dbg; g.localPlayer.setSetting('piercers', 0); g.start(); }")
        # Space pauses single player (nothing moves, "Paused" at the bottom) and carries on
        await page.mouse.move(500, 300)
        await page.keyboard.press('Space')
        await page.wait_for_timeout(300)
        ps = await page.evaluate("() => { const g = window.__dbg; return { paused: g.paused, frame: g.frameNo, pos: g.localPlayer.swarm.pos[0], hint: document.getElementById('pause-hint').textContent }; }")
        await page.wait_for_timeout(500)
        ps2 = await page.evaluate("() => { const g = window.__dbg; return { frame: g.frameNo, pos: g.localPlayer.swarm.pos[0] }; }")
        await page.keyboard.press('Space')
        await page.wait_for_timeout(500)
        ps3 = await page.evaluate("() => { const g = window.__dbg; return { paused: g.paused, frame: g.frameNo, hint: document.getElementById('pause-hint').textContent }; }")
        t.ok(ps['paused'] and ps2['frame'] == ps['frame'] and ps2['pos'] == ps['pos'] and 'Paused' in ps['hint'], 'Space pauses single player ("Paused" at the bottom)', {**ps, 'later': ps2})
        t.ok(not ps3['paused'] and ps3['frame'] > ps['frame'] and ps3['hint'] == 'Press Space to pause', 'Space again carries on ("Press Space to pause")', ps3)
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
          p.setSetting('count', 100); p.setSetting('speed', 0.5); p.setSetting('power', 2.5); }""")
        worst_inside = worst_shared = 0
        s = await page.evaluate(STATE)
        for _ in range(240):
            # small steps near the end, so the jump and the next arrival are still to come
            await h.fast_forward(page, 400 if s['left'] > 5000 else 50)
            s = await page.evaluate(STATE)
            worst_inside = max(worst_inside, s['inside'])
            worst_shared = max(worst_shared, s['shared'] if s['left'] > 300 else 0)
            if s['left'] == 0 or not s['alive'] or s['level'] > 1:
                break
        t.ok(s['left'] == 0 or s['level'] > 1, 'the planet is eaten to the last voxel', s['left'])
        t.ok(worst_inside == 0, 'no unit inside solid voxels', [worst_inside, await page.evaluate('() => (window.__inside || []).slice(0, 5)')])
        t.ok(worst_shared == 0, 'no bite shared while free voxels are left', worst_shared)

        # the next planet: the tunnel opens, the ships come out of it, it closes
        ar = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm;
          let f = 0; while (g.level < 2 && f < 400) { g.update(); f++; }
          const seen = new Set(); let maxOpen = 0, hiddenAtStart = 0, n = 0;
          for (let i = 0; i < s.count; i++) hiddenAtStart += s.hidden[i];
          for (; n < 600 && p.arrival.phase !== 'done'; n++) { g.update(); seen.add(p.arrival.phase); maxOpen = Math.max(maxOpen, p.beacon.openness); }
          for (let k = 0; k < 80; k++) g.update();
          let hidden = 0; for (let i = 0; i < s.count; i++) hidden += s.hidden[i];
          return { level: g.level, hiddenAtStart, phases: [...seen], maxOpen, hidden, closed: p.beacon.openness < 0.05, count: s.count }; }""")
        t.ok(ar['level'] == 2 and ar['hiddenAtStart'] == ar['count'] and ar['maxOpen'] > 0.95 and 'emerging' in ar['phases'],
             'next planet: the tunnel opens and the ships come out of it', ar)
        t.ok(ar['hidden'] == 0 and ar['closed'], 'when they are all out, the tunnel closes', ar)
        await h.fast_forward(page, 600)
        s = await page.evaluate(STATE)
        # (the swarm may already have started on it)
        t.ok(s['level'] == 2 and s['alive'] and 0 < s['left'] <= s['total'], 'next planet appears after the jump',
             f"level {s['level']}, {s['left']} of {s['total']} left")
        # the jump to hyperspace (the rest of planet 2 eaten at once): the ships go one after another
        # (random waits, several at a time with many ships), leaving streaks, and are gone
        jp = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet;
          g.stop();
          for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) pl.remove(idx);
          for (const f of [...(pl.fragments?.list || [])]) for (const c of pl.fragments.cellsOf(f)) pl.remove(c);
          let most = 0, frames = 0, streaks = 0, firstGone = -1;
          p.setSetting('count', 60);
          g.update();
          const mode = p.homeMode;
          p.setSetting('count', 70); // ships added while the others jump go too
          while (!p.departed() && frames < 400) {
            g.update(); frames++;
            let w = 0, h = 0; for (let i = 0; i < s.count; i++) { if (s.warpT[i] > 0) w++; h += s.hidden[i]; }
            if (h > 0 && firstGone < 0) firstGone = frames;
            most = Math.max(most, w);
            if (frames % 10 === 0) { s.render(g.camera); streaks = Math.max(streaks, (s.warpTrails || []).filter((m) => m.group.visible).length); }
          }
          return { mode, frames, most, streaks, firstGone, gone: p.departed(), count: s.count }; }""")
        t.ok(jp['mode'] == 'jump' and jp['gone'] and 1 <= jp['most'] < jp['count'] and jp['streaks'] > 0 and jp['frames'] > 100,
             'planet eaten: the ships jump to hyperspace one after another, leaving streaks', jp)
        await page.evaluate("() => window.__dbg.start()")
        t.ok(s['home'] is None, 'the swarm is back to work on the new planet')

        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
