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
        # the mission after the Kuiper Belt, and Earth's level number (missions come in the map's order)
        nx = await page.evaluate("""async () => { const g = window.__dbg, { SOLAR } = await import('./js/solar.js'), id = g.cfg.levels[1].body;
          return { id, name: SOLAR.find((b) => b.id === id).name, earth: g.cfg.levels.findIndex((l) => l.body === 'earth') + 1 }; }""")
        NEXT, EARTH = nx['name'], nx['earth']

        # the loader goes once everything is in; the start screen over the start picture, the title and the menu
        await page.wait_for_function("() => !document.getElementById('loader')", timeout=10000)
        sp0 = await page.evaluate("""() => { const m = document.getElementById('menu'); return { splash: m.classList.contains('is-splash'),
          bg: getComputedStyle(m).backgroundImage, title: getComputedStyle(document.getElementById('menu-title')).textTransform,
          img: performance.getEntriesByType('resource').some((r) => r.name.endsWith('img/start.jpg')) }; }""")
        t.ok(sp0['splash'] and 'img/start.jpg' in sp0['bg'] and sp0['img'] and sp0['title'] == 'uppercase', 'the loader is gone; the start screen over the start picture, with the title', sp0)
        # start screen
        choices = await page.locator('.menu-choice:not(.menu-extra)').all_inner_texts()
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
        t.ok(await page.locator('.menu-choice >> nth=0').inner_text() != '' and (await page.text_content('#menu-title')).startswith('Hive Hunger'), 'Esc goes back from Settings')
        # Ship guide: every type on one screen, attack and support apart; pointing at one plays its shot
        await page.click('.menu-guide')
        gd = await page.evaluate("""() => ({ sections: [...document.querySelectorAll('.guide-section .settings-title')].map((e) => e.textContent),
          attack: [...document.querySelectorAll('.guide-section:nth-of-type(1) .guide-ship')].map((e) => e.dataset.kind),
          support: [...document.querySelectorAll('.guide-section:nth-of-type(2) .guide-ship')].map((e) => e.dataset.kind),
          fits: document.querySelector('.menu-card').getBoundingClientRect().height <= window.innerHeight })""")
        t.ok(gd['sections'] == ['Attack', 'Support'] and len(gd['attack']) == 10 and gd['support'] == ['tugs', 'supports', 'cleaners', 'boosters', 'siphons', 'scoops'] and gd['fits'],
             'Ship guide: 16 ships, attack and support apart, on one screen', gd)
        await page.set_viewport_size({'width': 1000, 'height': 480})
        gs = await page.evaluate("""() => { const s = document.querySelector('.guide-scroll'), b = document.querySelector('.guide-back'), t = document.getElementById('menu-title');
          s.scrollTop = 99999; const r = b.getBoundingClientRect(), tr = t.getBoundingClientRect();
          const out = { scrolls: s.scrollHeight > s.clientHeight && s.scrollTop > 0, backSeen: r.bottom <= innerHeight && !s.contains(b), titleSeen: tr.top >= 0 && !s.contains(t) };
          s.scrollTop = 0; return out; }""")
        await page.set_viewport_size({'width': 1000, 'height': 640})
        t.ok(gs['scrolls'] and gs['backSeen'] and gs['titleSeen'], 'on a low screen only the ships scroll: the title and Back stay in view', gs)
        pic = lambda: page.evaluate("() => document.querySelector('.guide-ship[data-kind=snipers] canvas').toDataURL()")
        still = await pic()
        await page.hover('.guide-ship[data-kind=snipers]')
        frames = []
        for _ in range(4):
            await page.wait_for_timeout(250)
            frames.append(await pic())
        t.ok(len(set(frames)) > 1 and still not in frames[1:], 'pointing at a ship plays its shot', len(set(frames)))
        await page.keyboard.press('Escape')
        t.ok((await page.text_content('#menu-title')).startswith('Hive Hunger'), 'Esc goes back from the Ship guide')
        order = await page.evaluate("() => [...document.querySelectorAll('#ships .shipbar-item, #ships .shipbar-sep')].map((e) => e.classList.contains('shipbar-sep') ? '|' : e.className.match(/shipbar-(\\w+)/g)[1].slice(8))")
        t.ok(order == ['eaters', 'lasers', 'storms', 'orbs', 'splashers', 'bombers', 'drills', 'piercers', 'cutters', 'snipers', '|', 'tugs', 'supports', 'cleaners', 'boosters', 'siphons', 'scoops'],
             'the ship bar in the guide\'s order: attack ships, a line, support ships', order)
        BAR = "() => { const t = document.querySelector('.shipbar-track'), l = document.querySelector('.shipbar-left'), r = document.querySelector('.shipbar-right'), b = document.getElementById('ships').getBoundingClientRect(); return { shown: !l.hidden && !r.hidden, left: l.disabled, right: r.disabled, x: Math.round(t.scrollLeft), inside: b.left >= 0 && b.right <= innerWidth }; }"
        await page.set_viewport_size({'width': 560, 'height': 640})
        await page.wait_for_timeout(100)
        narrow = await page.evaluate(BAR)
        await page.evaluate("() => document.querySelector('.shipbar-right').click()")
        await page.wait_for_timeout(600)
        moved = await page.evaluate(BAR)
        for _ in range(8):
            await page.evaluate("() => document.querySelector('.shipbar-right').click()")
            await page.wait_for_timeout(400)
        end = await page.evaluate(BAR)
        await page.set_viewport_size({'width': 1800, 'height': 640})
        await page.wait_for_timeout(100)
        wide = await page.evaluate(BAR)
        await page.set_viewport_size({'width': 1000, 'height': 640})
        t.ok(narrow['shown'] and narrow['left'] and not narrow['right'] and narrow['x'] == 0 and narrow['inside'] and moved['x'] > 0 and not moved['left']
             and end['right'] and not end['left'] and not wide['shown'],
             'ship bar too wide for the screen: ◀ ▶ scroll it (greyed at the ends); hidden when all ships fit', [narrow, moved, end, wide])
        await page.click('.menu-settings')
        await page.click('.settings-buttons button >> nth=0')  # Reset settings
        rs = await page.evaluate("() => ({ ratio: window.__dbg.renderer.getPixelRatio(), aa: window.__dbg.renderer.getContextAttributes().antialias, fps: document.getElementById('fps').hidden })")
        await page.click('.settings-buttons .is-primary')  # Back
        t.ok(rs['aa'] and rs['fps'] and rs['ratio'] == 1, 'Reset settings restores them (native resolution, smooth edges, no FPS counter)', rs)
        start_ships = await page.evaluate("""() => ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers', 'snipers', 'splashers', 'boosters', 'cutters', 'siphons', 'scoops'].map((k) => +document.querySelector('.shipbar-' + k + ' .shipbar-count').textContent)""")
        title = await page.text_content('#menu-title')
        version = await page.inner_text('#version')
        t.ok(title.startswith('Hive Hunger') and title.endswith(version) and version.startswith('v0.'), 'start screen shows the version next to the title', title)
        before = await page.evaluate(STATE)
        await page.wait_for_timeout(800)
        after = await page.evaluate(STATE)
        t.ok(not after['started'] and before['cx'] == after['cx'] and after['spin'] == 0,
             'nothing moves before a mode is chosen')

        # single player: the solar system map — every body from the Kuiper Belt in to the Sun; the next
        # mission's card opens at once; bodies without a level yet are "coming soon"
        await page.click('.menu-choice >> nth=0')
        await page.wait_for_timeout(500)
        mp = await page.evaluate("""() => ({ map: !document.getElementById('map').hidden, started: window.__dbg.started,
          labels: [...document.querySelectorAll('.map-label')].map((e) => e.textContent),
          card: document.querySelector('.map-card-name')?.textContent, status: document.querySelector('.map-card-status')?.textContent,
          start: document.querySelector('.map-start')?.textContent, pic: document.querySelector('.map-pic')?.width,
          task: document.querySelector('.map-card-task')?.textContent })""")
        t.ok(mp['map'] and not mp['started'] and len(mp['labels']) == 21 and mp['labels'][0] == 'Kuiper Belt' and mp['labels'][19] == 'Sun' and mp['labels'][20] == 'Hive Carrier',
             'Single player opens the solar system map: from the Kuiper Belt in to the Sun', mp['labels'])
        t.ok(mp['card'] == 'Kuiper Belt' and mp['status'] == 'Next mission' and mp['start'] == 'Start' and mp['pic'] and 'Task' in (mp['task'] or ''),
             'the next mission\'s card: a picture, what it is, the task and Start', mp)
        # the Hive Carrier beyond the Kuiper Belt: its card, Go aboard (full size, its modules), Esc back to the map
        hc = await page.evaluate("""async () => { const m = window.__map, it = m.items.get('carrier'), kb = m.items.get('kuiper').body;
          const { CONFIG } = await import('./js/config.js'), v = m.carrier.voxels;
          const p = it.mesh.position.clone().project(m.camera);
          const tags = new Set(); for (let i = 0; i < v.hp.length; i++) if (v.hp[i]) tags.add(v.tags[i]); for (const l of v.lights) tags.add(l.tags ?? 0);
          return { r: Math.hypot(it.mesh.position.x, it.mesh.position.z), belt: kb.orbit + kb.width, screen: [p.x, p.y], NX: v.NX, earth: CONFIG.planet.radius * 2,
            hives: v.hives, comb: v.comb, combCells: v.combCells, honey: v.lights.filter((l) => l.kind === 'cell' && l.cell >= 200).length, lights: v.lights.length, kinds: [...new Set(v.lights.map((l) => l.kind))].sort(), tags: [...tags].filter(Boolean).sort((a, b) => a - b), tris: m.carrier.triangles }; }""")
        t.ok(hc['r'] > hc['belt'] and hc['screen'][0] > 0.3 and hc['screen'][1] > 0.3,
             'the Hive Carrier waits beyond the Kuiper Belt, at the top right', hc)
        t.ok(hc['combCells'] > 150 and hc['honey'] > 50, 'no runway: the deck overgrown with honeycomb (capped, glowing with honey, open)', hc)
        t.ok(hc['NX'] == 5 * hc['earth'] and hc['hives'] == 18 and hc['comb'] > 300 and hc['kinds'] == ['bridge', 'cell', 'hangar', 'nozzle', 'vent', 'window'] and hc['tags'] == list(range(1, 10)) and hc['tris'] > 20000,
             'the carrier: 5 × Earth long, honeycomb modules along both sides and round the hangar\'s mouth, windows, vents, nozzles; every voxel in a module', hc)
        await page.click('.map-label >> text=Hive Carrier', force=True)
        cc = await page.evaluate("() => [document.querySelector('.map-card-name').textContent, document.querySelector('.map-card-status').textContent, document.querySelector('.map-start').textContent]")
        t.ok(cc == ['Hive Carrier', 'All systems operational', 'Go aboard'], 'its card: what it is, all systems operational, Go aboard', cc)
        await page.click('.map-start')
        await page.wait_for_timeout(300)
        ab = await page.evaluate("""() => ({ aboard: window.__map.aboard, title: document.querySelector('.map-title').textContent,
          modules: [...document.querySelectorAll('.carrier-module')].map((e) => [e.querySelector('.carrier-module-name').textContent, e.querySelector('.carrier-module-state').textContent]),
          labels: document.querySelector('.map-labels').hidden, started: window.__dbg.started })""")
        lt = await page.evaluate("""() => { const m = window.__map, c = m.carrier, d = c.detail(1), G = c.groups.value, kinds = c.groupKinds;
          const lit = d.hull.reduce((n, g) => { const A = g.attributes.aLitA.array; for (let i = 0; i < A.length; i += 4) if (A[i] + A[i + 1] + A[i + 2] > 0) n++; return n; }, 0);
          // over a minute: some rows of windows go out (and the hull round them darkens with them), and come back
          const w = kinds.map((k, i) => (k === 'window' ? i : -1)).filter((i) => i >= 0), offs = new Set(), ons = new Set();
          for (let t = 0; t < 60; t += 0.25) { c.update(t, [m.big]); for (const i of w) { if (G[i] < 0.05) offs.add(i); if (G[i] > 0.95) ons.add(i); } }
          const real = m.big.userData.real.map((r) => kinds[r.group]).sort();
          return { groups: kinds.length, lit, sources: d.baked.sources, windows: w.length, wentOut: offs.size, cameBack: [...offs].filter((i) => ons.has(i)).length, real, finite: [...G].every(Number.isFinite) }; }""")
        t.ok(lt['groups'] <= 64 and lt['lit'] > 5000 and lt['finite'] and lt['real'] == ['bridge', 'cell', 'cell', 'hangar', 'nozzle', 'nozzle'],
             'the carrier\'s light on its hull: glowing voxels in groups, their light worked out once on the hull; a few real lights aboard', lt)
        t.ok(lt['wentOut'] > 0 and lt['cameBack'] > 0, 'rows of windows go out now and then (the hull round them darkens) and come back', lt)
        t.ok(ab['aboard'] and ab['title'] == 'Hive Carrier' and ab['labels'] and not ab['started']
             and [m[0] for m in ab['modules']] == ['Hull', 'Bridge', 'Reactor', 'Engines', 'Flight deck', 'Hangar bay', 'Hive modules', 'Refinery', 'Sensor array'] and all(m[1] == 'Operational ✓' for m in ab['modules']),
             'Go aboard: the carrier full size and its modules, all operational', ab)
        await page.keyboard.press('Escape')
        back = await page.evaluate("() => [window.__map.aboard, !document.getElementById('map').hidden, document.querySelector('.map-title').textContent, document.querySelector('.map-card-name').textContent]")
        t.ok(back == [False, True, 'Solar system', 'Hive Carrier'], 'Esc aboard: back to the map, the carrier\'s card', back)
        # the planets spread out; a click on a planet with moons zooms in on them, Back (or Esc) shows the whole system again
        zm = await page.evaluate("""() => { const m = window.__map, o = (id) => m.items.get(id).body.orbit;
          return { mercury: o('mercury'), earth: o('earth'), kuiper: o('kuiper'), carrier: o('carrier') }; }""")
        await page.click('.map-label >> text=Jupiter', force=True)
        await page.wait_for_function("() => { const m = window.__map; return m.camera.position.distanceTo(m.items.get('jupiter').mesh.position) < 40; }", timeout=15000)
        zin = await page.evaluate("""() => { const m = window.__map, j = m.items.get('jupiter').mesh.position;
          const vis = (n) => { const l = [...document.querySelectorAll('.map-label')].find((e) => e.textContent === n); return l && !l.hidden; };
          return { focus: m.focus, dist: Math.round(m.camera.position.distanceTo(j)), io: vis('Io'), europa: vis('Europa'), back: !m.back.hidden,
            card: document.querySelector('.map-card-name').textContent, hint: document.querySelector('.map-hint').textContent }; }""")
        await page.click('.map-back')
        await page.wait_for_function("() => window.__map.camera.position.length() > 150", timeout=15000)
        zout = await page.evaluate("() => { const m = window.__map; return { focus: m.focus, map: !m.root.hidden, dist: Math.round(m.camera.position.length()) }; }")
        await page.click('.map-label >> text=Europa', force=True)
        await page.wait_for_timeout(300)
        moonz = await page.evaluate("() => window.__map.focus")
        await page.keyboard.press('Escape')
        await page.wait_for_timeout(200)
        esc = await page.evaluate("() => [window.__map.focus, !window.__map.root.hidden]")
        t.ok(zm['mercury'] >= 10 and zm['earth'] > 18 and zm['kuiper'] >= 77 and zm['carrier'] > zm['kuiper'] + 7.5,
             'the planets are spread out (the carrier still beyond the Kuiper Belt)', zm)
        t.ok(zin['focus'] == 'jupiter' and zin['dist'] <= 40 and zin['io'] and zin['europa'] and zin['back'] and zin['card'] == 'Jupiter' and 'its moons' in zin['hint'],
             'a click on a planet with moons zooms in on it and its moons (with Back)', zin)
        t.ok(zout['focus'] is None and zout['map'] and zout['dist'] > 150 and moonz == 'jupiter' and esc == [None, True],
             'Back (or Esc) shows the whole system again, still on the map; a click on a moon zooms in on its planet', [zout, moonz, esc])
        await page.click('.map-label >> text=Saturn', force=True)
        soon = await page.evaluate("() => [document.querySelector('.map-card-name').textContent, document.querySelector('.map-start').textContent, document.querySelector('.map-start').disabled]")
        t.ok(soon == ['Saturn', 'Coming soon', True], 'a body without a level yet: coming soon', soon)
        await page.click('.map-back')  # (zoomed on Saturn and its moon: back to the whole system)
        await page.wait_for_function("() => window.__map.camera.position.length() > 150", timeout=15000)
        await page.click('.map-label >> text=Kuiper Belt', force=True)
        await page.click('.map-start')
        await page.wait_for_timeout(500)
        s = await page.evaluate(STATE)
        kb = await page.evaluate("() => [window.__dbg.bodyId, window.__dbg.planet.shape, document.getElementById('map').hidden]")
        await page.wait_for_timeout(500)
        t.ok((await page.evaluate(STATE))['spin'] == 0, 'the camera doesn\'t turn by itself (no planet spin)')
        cam = await page.evaluate("() => { const c = window.__dbg.camera.position; return Math.round(Math.atan2(c.x, c.z) * 100) / 100; }")
        t.ok(abs(cam - 0.35) < 0.05, 'the Kuiper Belt: the camera starts turned, so the band is seen at an angle', cam)
        t.ok(s['started'] and await page.locator('#menu').is_hidden() and kb == ['kuiper', 'belt', True], 'Start on the card begins the mission (the Kuiper Belt)', kb)

        # Esc pauses: Resume, Save and exit, Exit to main menu (and Settings); Esc again carries on
        await page.keyboard.press('Escape')
        a = await page.evaluate(STATE)
        await page.wait_for_timeout(800)
        b = await page.evaluate(STATE)
        pz = await page.evaluate("() => ({ title: document.getElementById('menu-title').textContent, choices: [...document.querySelectorAll('#menu .menu-choice-label')].map((e) => e.textContent) })")
        t.ok(not b['started'] and a['cx'] == b['cx'] and pz['title'] == 'Paused' and pz['choices'] == ['Resume', 'Save game', 'Save and exit', 'Exit to main menu', 'Settings'],
             'Esc pauses: Resume, Save game, Save and exit, Exit to main menu', pz)
        await page.click('#menu .menu-choice >> text=Save game')
        sg = await page.evaluate("() => [document.getElementById('menu-title').textContent, document.querySelectorAll('#menu .menu-choice-note')[1].textContent, Boolean(localStorage.getItem('hive-hunger-save'))]")
        t.ok(sg[0] == 'Paused' and sg[1].startswith('Saved') and sg[2], 'Save game: saved, still paused', sg)
        await page.keyboard.press('Escape')
        t.ok((await page.evaluate(STATE))['started'] and await page.locator('#menu').is_hidden(), 'Esc again carries on')
        # play a little, then Save and exit; Single player asks: Continue or New game; Continue carries on from the save
        await page.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('speed', 0.3); p.score += 50; }")
        await h.fast_forward(page, 300)
        await page.keyboard.press('Escape')  # (paused: nothing is eaten meanwhile)
        sv0 = await page.evaluate("() => { const g = window.__dbg; return { seed: g.planet.seed, left: g.planet.left, score: g.localPlayer.score, speed: g.localPlayer.getSetting('speed') }; }")
        await page.click('#menu .menu-choice >> text=Save and exit')
        saved = await page.evaluate("() => ({ title: document.getElementById('menu-title').textContent, save: Boolean(localStorage.getItem('hive-hunger-save')), started: window.__dbg.started })")
        t.ok(saved['save'] and saved['title'].startswith('Hive Hunger') and not saved['started'], 'Save and exit: saved, back on the main menu', saved)
        sn = await page.evaluate("() => document.querySelector('#menu .menu-choice .menu-choice-note').textContent")
        t.ok(sn.startswith('New game or continue') and 'Kuiper Belt' in sn, 'with a save, Single player says before it is pressed: new game or continue', sn)
        await page.click('.menu-choice >> nth=0')
        cq = await page.evaluate("() => [document.getElementById('menu-title').textContent, [...document.querySelectorAll('#menu .menu-choice-label')].map((e) => e.textContent), document.querySelector('#menu .menu-choice-note').textContent]")
        t.ok(cq[0] == 'Single player' and cq[1] == ['Continue', 'New game'] and 'Kuiper Belt' in cq[2], 'Single player with a save: Continue or New game?', cq)
        await page.evaluate("() => { const g = window.__dbg; g.planet.dispose(); g.spawnPlanet(1); g.localPlayer.score = 0; }")  # (nothing of it left in memory)
        await page.click('#menu .menu-choice >> text=Continue')
        sv1 = await page.evaluate("() => { const g = window.__dbg; return { seed: g.planet.seed, left: g.planet.left, score: g.localPlayer.score, speed: g.localPlayer.getSetting('speed'), started: g.started, body: g.bodyId }; }")
        t.ok(sv1['started'] and sv1['body'] == 'kuiper' and sv1['seed'] == sv0['seed'] and sv1['left'] == sv0['left'] and sv1['score'] == sv0['score'] and sv1['speed'] == sv0['speed'],
             'Continue: the same planet with the same voxels eaten, the points and settings back', [sv0, sv1])
        # Exit to main menu (no saving); Settings → Delete save game (asks once more); then Single player goes straight to the map
        await page.keyboard.press('Escape')
        await page.click('#menu .menu-choice >> text=Exit to main menu')
        await page.click('.menu-settings')
        await page.click('.settings-delete')
        ask = await page.evaluate("() => [document.querySelector('.settings-delete').textContent, Boolean(localStorage.getItem('hive-hunger-save'))]")
        await page.click('.settings-delete')
        gone = await page.evaluate("() => [document.querySelector('.settings-delete').textContent, document.querySelector('.settings-delete').disabled, localStorage.getItem('hive-hunger-save'), localStorage.getItem('hive-hunger-progress')]")
        t.ok(ask == ['Really delete it?', True] and gone[0] == 'Save game deleted' and gone[1] and gone[2] is None and gone[3] is None,
             'Settings → Delete save game: asks once more, then the save (and the map\'s ticks) are gone', [ask, gone])
        await page.click('.settings-buttons .is-primary')  # Back
        await page.click('.menu-choice >> nth=0')
        await page.wait_for_timeout(300)
        t.ok(await page.evaluate("() => !document.getElementById('map').hidden"), 'no save: Single player opens the map')
        await page.click('.map-label >> text=Kuiper Belt', force=True)
        await page.click('.map-start')
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('speed', window.__dbg.cfg.swarm.speed)")
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

        gone = await page.evaluate("() => [document.getElementById('controls'), document.querySelector('.control-levels'), document.getElementById('ctl-reset'), document.querySelector('input[type=range]')]")
        t.ok(gone == [None, None, None, None], 'no settings panel (Units, Speed, Power, Turning, Reset) and no level switch', gone)

        # a planet right away (as Start on the map does): the swarm starts again from its tunnel
        await page.evaluate('(n) => window.__dbg.jumpToLevel(n)', EARTH)
        await page.wait_for_timeout(300)
        jump = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet;
          const c = s.center(), home = p.spawnWorld(); let inside = 0;
          for (let i = 0; i < s.count; i++) { const idx = pl.cellAt({ x: s.pos[i * 3], y: s.pos[i * 3 + 1], z: s.pos[i * 3 + 2] }); if (idx >= 0 && pl.hp[idx] > 0) inside++; }
          return { level: g.level, shape: pl.shape, home: Math.hypot(c.x - home.x, c.y - home.y, c.z - home.z), inside, left: pl.left, total: pl.total }; }""")
        t.ok(jump['level'] == EARTH and jump['shape'] == 'sphere', 'Earth right away', jump)
        t.ok(jump['home'] < 5 and jump['inside'] == 0, 'the swarm starts again from its beacon, not inside the planet', jump)
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('speed', 0.3)")
        await h.fast_forward(page, 400)
        after_jump = await page.evaluate('() => window.__dbg.planet.left')
        t.ok(after_jump < jump['total'], 'and starts eating the new planet', f"{jump['total']} → {after_jump}")
        await page.evaluate('() => window.__dbg.jumpToLevel(1)')
        await page.wait_for_timeout(300)
        t.ok((await page.evaluate('() => [window.__dbg.level, window.__dbg.planet.shape]')) == [1, 'belt'], 'back to level 1 (the Kuiper Belt)')

        # the ship bar (bottom): 2 of each at the start, how many shown by each thumbnail
        t.ok(start_ships == [3] + [0] * 15, 'at the start: 3 eaters, no other ships', start_ships)
        # (no bombers for the next checks: they would blow up meanwhile)
        await page.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('count', 20); p.setSetting('bombers', 0); p.setSetting('orbs', 0); p.setSetting('supports', 0); p.setSetting('cleaners', 0); p.setSetting('drills', 0); p.setSetting('piercers', 0); p.setSetting('snipers', 0); p.setSetting('splashers', 0); p.setSetting('boosters', 0); p.setSetting('cutters', 0); p.setSetting('storms', 3); p.setSetting('tugs', 3); p.setSetting('lasers', 2); }")
        await page.wait_for_timeout(400)
        ui = await page.evaluate("""() => ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers', 'snipers', 'splashers', 'boosters', 'cutters', 'siphons', 'scoops'].map((k) => +document.querySelector('.shipbar-' + k + ' .shipbar-count').textContent)""")
        t.ok(ui == [12, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'the thumbnails show how many ships of each type', ui)
        await page.evaluate('(n) => window.__dbg.jumpToLevel(n)', EARTH)
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('speed', 0.3)")
        await h.fast_forward(page, 300)
        # buying: + on a thumbnail = one more of that type (free for now), Shift = 10; no other ship changes its type
        KEEP = """() => { const s = window.__dbg.localPlayer.swarm; s.fillKinds(); const m = {};
          for (let i = 0; i < s.count; i++) m[s.pos[i * 3].toFixed(4) + ',' + s.pos[i * 3 + 1].toFixed(4)] = s.kindOf[i]; return m; }"""
        types0, types1 = await page.evaluate(f"""() => {{ const keep = {KEEP}; const a = keep();
          document.querySelector('.shipbar-storms .shipbar-buy').click(); return [a, keep()]; }}""")
        ui = await page.evaluate("""() => ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers', 'snipers', 'splashers', 'boosters', 'cutters', 'siphons', 'scoops'].map((k) => +document.querySelector('.shipbar-' + k + ' .shipbar-count').textContent)""")
        same = all(types1.get(k) == v for k, v in types0.items())
        t.ok(ui == [12, 2, 4, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] and len(types1) == len(types0) + 1 and same,
             '+ buys one ship of that type (free); every other ship keeps its type', ui)
        # a ship bought comes out of the tunnel like ships arriving: it opens, the ship flies out, it closes
        tun = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm;
          g.stop();
          let f = 0; while (p.arrival.phase !== 'done' && f < 600) { g.update(); f++; }
          const n0 = s.count, base0 = p.base.count; p.buyShips('drills', 1);
          const i = s.kindStart('drills') + s.drills - 1;
          const r = { hidden: s.hidden[i], phase: p.arrival.phase, others: Array.from(s.hidden.slice(0, s.count)).filter((h) => h).length };
          let opened = 0, out = -1;
          for (let k = 0; k < 400 && (out < 0 || p.arrival.phase !== 'done'); k++) {
            g.update(); opened = Math.max(opened, p.beacon.openness);
            if (out < 0 && !s.hidden[i]) { const w = p.spawnWorld(); out = Math.hypot(s.pos[i * 3] - w.x, s.pos[i * 3 + 1] - w.y, s.pos[i * 3 + 2] - w.z); }
          }
          for (let k = 0; k < 200 && p.beacon.openness >= 0.05; k++) g.update(); // (it eases shut)
          r.opened = opened; r.out = out; r.closed = p.beacon.openness < 0.05; r.count = s.count - n0;
          p.setSetting('drills', 0); p.setSetting('count', base0); g.start();
          return r; }""")
        t.ok(tun['hidden'] == 1 and tun['others'] == 1 and tun['phase'] == 'opening' and tun['opened'] > 0.85 and 0 <= tun['out'] < 6 and tun['closed'] and tun['count'] == 1,
             'a ship bought waits in the tunnel, the tunnel opens, the ship flies out of it and the tunnel closes', tun)
        await page.click('.shipbar-eaters .shipbar-buy', modifiers=['Shift'])
        ui = await page.evaluate("""() => ['eaters', 'lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers', 'snipers', 'splashers', 'boosters', 'cutters', 'siphons', 'scoops'].map((k) => +document.querySelector('.shipbar-' + k + ' .shipbar-count').textContent)""")
        t.ok(ui[0] == 22 and sum(ui) == 31, 'Shift + buys 10', ui)
        # − sends one away: it jumps to hyperspace like at the end of a planet, then it is gone; no other ship changes its type
        sl = await page.evaluate(f"""() => {{ const g = window.__dbg, p = g.localPlayer, s = p.swarm, keep = {KEEP};
          g.stop();
          const types0 = keep(), n0 = s.count, storms0 = s.storms;
          document.querySelector('.shipbar-storms .shipbar-sell').click();
          const shown = +document.querySelector('.shipbar-storms .shipbar-count').textContent;
          let jumped = 0, f = 0;
          for (; f < 200 && s.count === n0; f++) {{ g.update(); for (let i = 0; i < s.count; i++) if (s.warpT[i] > 0 && s.leaving[i]) jumped = 1; }}
          const types1 = keep();
          // the ships that stayed: none changed its type (positions move between frames, so compare the counts by type)
          s.fillKinds(); const byType = {{}}; for (let i = 0; i < s.count; i++) byType[s.kindOf[i]] = (byType[s.kindOf[i]] || 0) + 1;
          const r = {{ n0, n1: s.count, storms0, storms1: s.storms, shown, jumped, frames: f, base: p.base.count, byType }};
          g.start(); return r; }}""")
        t.ok(sl['shown'] == sl['storms0'] - 1 and sl['jumped'] and sl['n1'] == sl['n0'] - 1 and sl['storms1'] == sl['storms0'] - 1 and sl['frames'] > 30,
             '− sends a ship away: it jumps to hyperspace and is then gone (one fewer of that type)', sl)
        last = await page.evaluate("""async () => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, n = s.count; g.stop();
          const wait = () => new Promise((r) => setTimeout(r, 400)); // (the bar follows every 300 ms)
          let sent = 0; for (const k of ['eaters', 'lasers', 'storms', 'tugs']) sent += p.sellShips(k, 200);
          for (let f = 0; f < 300 && s.count; f++) g.update();
          await wait();
          const off = [...document.querySelectorAll('.shipbar-sell')].every((b) => b.disabled);
          // a ship just bought, still in the tunnel: − takes it at once, it never comes out
          p.buyShips('lasers', 1); const inTunnel = s.hidden[0] === 1 && s.count === 1;
          await wait(); const canSell = !document.querySelector('.shipbar-lasers .shipbar-sell').disabled;
          p.sellShips('lasers', 1); g.update(); const gone = s.count;
          let out = 0; for (let f = 0; f < 300; f++) { g.update(); out += s.count; }
          g.start(); return [sent, n, s.count, off, inTunnel, canSell, gone, out]; }""")
        t.ok(last[0] == last[1] and last[2] == 0 and last[3], 'every ship can be sent away, the last one too (then − is off everywhere)', last)
        t.ok(last[4] and last[5] and last[6] == 0 and last[7] == 0, 'a ship still in the tunnel can be sent away: gone at once, it never comes out', last)
        # with Brood bought (+10 ships on top): sending ships away below that leaves no ship stuck in the tunnel
        # (before: the base could not go below 0, so the swarm didn't shrink and a hidden "eater" was left)
        br = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm; g.stop();
          const run = (n) => { for (let i = 0; i < n; i++) g.update(); };
          run(200); p.setSetting('count', 6); p.setSetting('lasers', 3); p.setSetting('storms', 0); p.setSetting('tugs', 0);
          const owned0 = [...p.tree.owned], score0 = p.score, spent0 = p.tree.spent;
          p.score += 1e5; g.buyUpgrade('units1'); run(300);
          const st = () => { let hidden = 0; for (let i = 0; i < s.count; i++) hidden += s.hidden[i]; return [s.count, s.lasers, hidden]; };
          const a = st(); p.sellShips('eaters', 100); run(200); const b = st(); p.sellShips('lasers', 1); run(200); const c = st();
          p.tree.load({ owned: owned0, spent: spent0 }); p.score = score0; p.setSetting('count', 21); p.setSetting('lasers', 2); p.applyUpgrades(); run(300); g.start();
          return { a, b, c }; }""")
        t.ok(br['a'] == [16, 3, 0] and br['b'] == [3, 3, 0] and br['c'] == [2, 2, 0],
             'with Brood\'s ships on top, sending ships away leaves none stuck in the tunnel (no extra eaters)', br)
        await page.evaluate("() => { const g = window.__dbg, p = g.localPlayer; for (let k = 0; k < 200; k++) g.update(); }")
        await page.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('count', 21); p.setSetting('lasers', 2); p.setSetting('storms', 4); p.setSetting('tugs', 3); }")
        await page.click('.shipbar-eaters .shipbar-buy', modifiers=['Shift'])
        full = await page.evaluate("""() => { const p = window.__dbg.localPlayer; p.buyShips('lasers', 200);
          const r = [p.swarm.count, p.swarm.lasers, document.querySelector('.shipbar-lasers .shipbar-buy').disabled];
          return new Promise((ok) => setTimeout(() => ok([r[0], r[1], document.querySelector('.shipbar-lasers .shipbar-buy').disabled]), 400)); }""")
        t.ok(full == [100, 71, True], 'at most 100 ships in all (then + is off)', full)
        # choosing a group: one at a time, eaters at first, it stays chosen
        ch = await page.evaluate("""() => { const g = window.__dbg, was = g.group;
          document.querySelector('.shipbar-tugs .shipbar-pick').click();
          document.querySelector('.shipbar-storms .shipbar-pick').click();
          return [was, g.group, [...document.querySelectorAll('.shipbar-item.is-chosen')].length]; }""")
        t.ok(ch == ['eaters', 'storms', 1], 'a group is chosen on the bar (one at a time, eaters at first)', ch)
        await page.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('count', 20); p.setSetting('lasers', 2); p.setSetting('storms', 3); p.setSetting('tugs', 3); }")
        await h.fast_forward(page, 200)
        # a click in empty space does nothing; on a voxel it sends only the chosen group there
        cmd = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, T = window.THREE;
          const bites = () => Array.from(s.food.slice(0, s.count));
          const b0 = bites();
          g.onTap(new T.Vector2(0.97, 0.97));
          const empty = [p.groups.every((x) => !x.mode), bites().join() === b0.join()];
          g.onTap(new T.Vector2(0, 0));
          const [a, b] = p.groupRange('storms'), b1 = bites();
          const others = b1.every((f, i) => (i >= a && i < b) || f === b0[i]);
          const storms = b1.slice(a, b).every((f) => f < 0) && s.redirect.slice(a, b).every((r) => r === 1);
          const pt = p.group('storms').point;
          for (let n = 0; n < 30; n++) g.update();
          let near = 0; for (let i = a; i < b; i++) if (s.food[i] >= 0) { const c = g.planet.cellCenter(s.food[i], new T.Vector3()); if (c.distanceTo(new T.Vector3(pt.x, pt.y, pt.z)) < 4) near++; }
          return { empty, mode: p.group('storms').mode, eaters: p.group('eaters').mode, others, storms, near, n: b - a }; }""")
        t.ok(cmd['empty'] == [True, True], 'a click in empty space sends nobody', cmd)
        t.ok(cmd['mode'] == 'go' and cmd['eaters'] is None and cmd['others'] and cmd['storms'] and cmd['near'] == cmd['n'],
             'a click on a voxel sends only the chosen group: their next bites are next to it, the others carry on', cmd)
        # the tunnel clicked with tugs chosen: only the tugs go home and wait; the rest eat on
        home = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, T = window.THREE;
          g.group = 'eaters';
          const w = p.spawnWorld(), v = new T.Vector3(w.x, w.y, w.z).project(g.camera);
          g.onTap(new T.Vector2(v.x, v.y));
          for (let n = 0; n < 600; n++) g.update();
          const [a, b] = p.groupRange('eaters'), h = p.spawnWorld();
          let far = 0; for (let i = a; i < b; i++) if (Math.hypot(s.pos[i * 3] - h.x, s.pos[i * 3 + 1] - h.y, s.pos[i * 3 + 2] - h.z) > 6) far++;
          const eating = Array.from(s.food.slice(0, a)).filter((f) => f >= 0).length;
          const r = { mode: p.group('eaters').mode, eaterBites: Array.from(s.food.slice(a, b)).filter((f) => f >= 0).length, far, eating, beacon: p.beacon.active, hint: document.querySelector('.hud-hint')?.textContent };
          g.group = 'eaters'; g.onTap(new T.Vector2(0, 0)); // sent out again
          r.after = p.group('eaters').mode; r.beaconAfter = p.anyHome();
          return r; }""")
        t.ok(home['mode'] == 'home' and home['eaterBites'] == 0 and home['far'] == 0 and home['eating'] > 0 and home['beacon'],
             'the tunnel with a group chosen calls only that group home (it waits there); the others eat on', home)
        t.ok(home['after'] == 'go' and not home['beaconAfter'], 'a click on a voxel sends it out again', home)
        await page.evaluate("() => { const p = window.__dbg.localPlayer; p.setSetting('count', 20); p.setSetting('lasers', 8); p.setSetting('storms', 1); p.setSetting('tugs', 0); p.groups.forEach((x) => { x.mode = null; x.point = null; }); }")
        sp = await page.evaluate("""() => { const g = window.__dbg, s = g.localPlayer.swarm;
          // (the ships come out of the tunnel first)
          for (let n = 0; n < 400 && g.localPlayer.arrival.phase !== 'done'; n++) g.update();
          // (a frame in which a laser ship is flying, not sitting at its bite)
          let out = null;
          for (let f = 0; f < 120 && !(out && out.laser > 0); f++) {
            g.update();
            const before = Array.from(s.pos); g.update();
            const step = (i) => Math.hypot(s.pos[i * 3] - before[i * 3], s.pos[i * 3 + 1] - before[i * 3 + 1], s.pos[i * 3 + 2] - before[i * 3 + 2]);
            const L = [], E = []; for (let i = 0; i < s.count; i++) (i < s.lasers ? L : E).push(step(i)); // storm ships fly at full speed
            out = { laser: Math.max(...L), eater: Math.max(...E) };
          }
          return out; }""")
        t.ok(abs(sp['laser'] - 0.27) < 0.005 and abs(sp['eater'] - 0.3) < 0.005, 'laser ships fly 10% slower', sp)
        await h.fast_forward(page, 500)
        lz = await page.evaluate("""() => { const g = window.__dbg, s = g.localPlayer.swarm; s.render(g.camera);
          const d = (i) => { const i3 = i * 3; return Math.hypot(s.pos[i3] - s.foodPos[i3], s.pos[i3 + 1] - s.foodPos[i3 + 1], s.pos[i3 + 2] - s.foodPos[i3 + 2]); };
          const L = [], E = []; for (let i = 0; i < s.count; i++) if (s.landed[i] && s.food[i] >= 0 && !s.isStorm(i) && !s.isOrb(i)) (i < s.lasers ? L : E).push(d(i));
          const red = s.mesh.instanceColor.getX(0) > 0.9 && s.mesh.instanceColor.getY(0) < 0.5, yellow = s.mesh.instanceColor.getX(s.count - 1) > 0.9 && s.mesh.instanceColor.getZ(s.count - 1) < 0.5;
          L.sort((a, b) => a - b); // (most lasers sit at laser range; one stuck against a wall may bite through it up close)
          return { laser: L.length ? L[L.length >> 1] : 0, eater: E.length ? Math.max(...E) : 9, beams: s.beamCount, red, yellow }; }""")
        t.ok(lz['laser'] > 1.5 and lz['eater'] < 1.5 and lz['beams'] > 0, 'laser ships eat from a distance (with a beam), eaters up close', lz)
        t.ok(lz['red'] and lz['yellow'], 'laser ships are red, eaters yellow', lz)
        # storm ship: from laser range, a forked bolt — 40% of a laser's damage on the bite, 30% on each of the two nearest voxels
        st = await page.evaluate("""() => { const g = window.__dbg, s = g.localPlayer.swarm, pl = g.planet, i = s.lasers;
          const blue = s.mesh.instanceColor.getZ(i) > 0.9 && s.mesh.instanceColor.getX(i) < 0.7;
          const far = () => Math.hypot(s.pos[i * 3] - s.foodPos[i * 3], s.pos[i * 3 + 1] - s.foodPos[i * 3 + 1], s.pos[i * 3 + 2] - s.foodPos[i * 3 + 2]) > 1.5; // (not a bite through a wall it got stuck on)
          const ready = () => s.landed[i] && s.aimed[i] && s.food[i] >= 0 && far() && pl.strengthOf(s.food[i]) > 0.3 && ((n) => n.length === 2 && n.every((x) => pl.strengthOf(x) > 0.3))(pl.nearestAround(s.food[i], 2, s.food[i]));
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
        units = await page.evaluate("""() => [window.__dbg.localPlayer.swarm.count, ...['bombers', 'eaters'].map((k) => +document.querySelector('.shipbar-' + k + ' .shipbar-count').textContent)]""")
        t.ok(units[0] == bm.get('count') and units[1] == 0, 'the ship bar shows one bomber fewer', units)
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
          const line = () => { const row = [], q = P.clone(); for (let k = 0; k < (P.length() + pl.half * 1.8) / (pl.s * 0.5) && row.length < c.pierce; k++) { q.addScaledVector(d, pl.s * 0.5); const n = pl.cellAt(q); if (n >= 0 && pl.hp[n] > 0 && !row.includes(n)) row.push(n); } return row; };
          const row = line(), dist = row.length ? pl.cellCenter(row[0], new T.Vector3()).distanceTo(P) : 0;
          const before = row.map((n) => pl.strengthOf(n)), shown = s.piercerBolts.shown;
          g.update(); for (let k = 0; k < 4; k++) s.render(g.camera);
          const lost = row.map((n, k) => before[k] - pl.strengthOf(n));
          const eater = g.cfg.planet.strength / g.cfg.swarm.eatFrames;
          const orange = s.piercerBeamCount > 0, spirals = s.piercerBolts.shown - shown;
          // it fires until it is through, then 2 s more, then switches off
          let lastHit = 0, off = -1, still = true, farEnd = 0;
          for (let k = 1; k < 20000 && off < 0; k++) {
            g.update();
            if (s.pierceOn[i] && s.pierceAfter[i] === 0) lastHit = k;
            if (s.pierceOn[i] && s.pierceAfter[i] > 0) farEnd = Math.max(farEnd, Math.hypot(s.pierceEnd[i*3] - P.x, s.pierceEnd[i*3+1] - P.y, s.pierceEnd[i*3+2] - P.z));
            if (s.pierceOn[i] && Math.hypot(s.pos[i*3] - P.x, s.pos[i*3+1] - P.y, s.pos[i*3+2] - P.z) > 1e-6) still = false;
            if (!s.pierceOn[i]) off = k;
          }
          const through = line().length === 0;
          // then it goes on: a new bite (flying to it, or from here if it is in range) and a new line
          let next = false;
          for (let k = 0; k < 600 && !next; k++) { g.update(); next = s.food[i] >= 0 || (s.pierceOn[i] && s.pierceDir[i*3] * d.x + s.pierceDir[i*3+1] * d.y + s.pierceDir[i*3+2] * d.z < 0.9999); }
          return { fired: true, copper, dist, row: row.length, lost, want: eater * c.damage, orange, spirals, after: off - lastHit, through, still, next, farEnd, planetSize: pl.half * 2 }; }""")
        t.ok(pc.get('fired') and pc['copper'] and pc['dist'] > 4, 'a copper piercer fires from a distance (up to 20 voxels)', pc)
        t.ok(pc.get('row') == 3 and all(abs(x - pc['want']) < 1e-4 for x in pc['lost']), 'its beam goes through 3 voxels in a row and eats them at once (0.8 × an eater)', pc)
        t.ok(pc.get('orange') and pc.get('spirals', 0) > 0, 'an orange beam with a yellow spiral lightning round it', pc)
        t.ok(pc.get('through') and pc.get('still') and 118 <= pc.get('after', 0) <= 122, 'it fires along the locked line until it is through, then 2 s more, staying put', pc)
        t.ok(pc.get('farEnd', 0) > pc.get('planetSize', 1) * 2, 'once through, the beam goes on out through the hole into space', pc)
        t.ok(pc.get('next'), 'then it switches off and goes on to its next bite', pc)
        await page.evaluate("() => { const g = window.__dbg; g.localPlayer.setSetting('piercers', 0); }")
        # sniper: from any distance — stops, charges 5 s facing its bite, fires a shot that speeds up 5%
        # per voxel (a rounded glowing cap in front) and always destroys the voxel it hits; flies on 1 s
        sn = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet, c = g.cfg.swarm.sniper;
          p.setSetting('snipers', 1);
          const i = s.kindStart('snipers'); s.render(g.camera);
          const ic = s.mesh.instanceColor, teal = ic.getX(i) < 0.4 && ic.getY(i) > 0.7 && ic.getZ(i) > 0.6;
          // far out: 25 units above the surface
          const l = Math.hypot(s.pos[i*3], s.pos[i*3+1], s.pos[i*3+2]) || 1; for (let m = 0; m < 3; m++) s.pos[i*3+m] *= (pl.R + 25) / l;
          if (s.food[i] >= 0) pl.release(s.food[i]); s.food[i] = -1; s.snipePhase[i] = 0; s.snipeT[i] = 0;
          const fired0 = g.shots.fired;
          let f = 0, charge = -1; while (g.shots.fired === fired0 && f < 1500) { g.update(); f++; if (charge < 0 && s.snipePhase[i] === 1) charge = f; }
          if (g.shots.fired === fired0) return { fired: false, teal };
          const shot = g.shots.list[g.shots.list.length - 1], target = shot.target, P0 = new window.THREE.Vector3(s.pos[i*3], s.pos[i*3+1], s.pos[i*3+2]);
          const dist = P0.distanceTo(shot.to), left0 = pl.left;
          // its flight: speed after each frame; and the ship meanwhile
          const speeds = [], moved = []; let hitF = -1;
          for (let k = 0; k < 600 && hitF < 0; k++) { g.update(); if (g.shots.list.includes(shot)) speeds.push([shot.speed, shot.flown]); else hitF = k; moved.push(Math.hypot(s.pos[i*3] - P0.x, s.pos[i*3+1] - P0.y, s.pos[i*3+2] - P0.z)); }
          const last = speeds[speeds.length - 1] || [0, 0];
          const want = c.speed * Math.pow(c.accel, last[1] / pl.s);
          // after the shot: it flies on for 1 s, then stops to charge again
          const r0 = Math.hypot(s.pos[i*3], s.pos[i*3+1], s.pos[i*3+2]);
          let stopAt = -1; for (let k = 0; k < 400 && stopAt < 0; k++) { g.update(); if (s.snipePhase[i] === 1) stopAt = k; }
          // three more shots: it never closes in on the planet
          let rMin = r0; const f1 = g.shots.fired; for (let k = 0; k < 1500 && g.shots.fired < f1 + 3; k++) { g.update(); rMin = Math.min(rMin, Math.hypot(s.pos[i*3], s.pos[i*3+1], s.pos[i*3+2])); }
          return { fired: true, teal, charge: f - charge, dist, hit: hitF >= 0, gone: !pl.solid(target), eaten: left0 - pl.left,
            faster: last[0] > speeds[0][0] * 1.5, rate: Math.abs(last[0] - want) < 1e-6, cap: Boolean(shot.cap), moving: moved.length > 30 && moved[30] > 0.05,
            stopAt, moveFrames: c.moveFrames, r0, rMin, shots: g.shots.fired - f1 }; }""")
        t.ok(sn.get('fired') and sn['teal'] and sn['dist'] > 20, 'a teal sniper fires from far away (any distance)', sn)
        t.ok(sn.get('charge', 0) >= 299 and sn.get('charge', 0) <= 302, 'it stops and charges for 5 s before the shot', sn)
        t.ok(sn.get('faster') and sn.get('rate') and sn.get('cap'), 'the shot speeds up 5% per voxel, a rounded glowing cap in front', sn)
        t.ok(sn.get('hit') and sn.get('gone') and sn.get('eaten', 0) >= 1, 'it always destroys the voxel it hits', sn)
        t.ok(sn.get('moving'), 'after the shot it flies on', sn)
        t.ok(sn.get('shots', 0) >= 3 and sn.get('rMin', 0) > sn.get('r0', 9) - 1, 'and keeps its distance from the planet (it fires from anywhere)', sn)
        await page.evaluate("() => { const g = window.__dbg; g.localPlayer.setSetting('snipers', 0); }")
        # splasher: a wobbling bubble of liquid (drawn by the lens pass); where it lands a 3 × 3 × 2 block
        # soaks for 3 s, weakening, and is gone at the end
        sp = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet, c = g.cfg.swarm.splasher;
          p.setSetting('splashers', 1);
          const i = s.kindStart('splashers'); s.render(g.camera);
          const ic = s.mesh.instanceColor, blue = ic.getZ(i) > 0.9 && ic.getX(i) < 0.4;
          const fired0 = g.bubbles.fired, soaks0 = g.soaks.length;
          let f = 0; while (g.bubbles.fired === fired0 && f < 2000) { g.update(); f++; }
          if (g.bubbles.fired === fired0) return { fired: false, blue };
          const lens = g.bubbles.lenses().length;
          let k = 0; while (g.soaks.length === soaks0 && k < 600) { g.update(); k++; }
          if (g.soaks.length === soaks0) return { fired: true, blue, landed: false };
          // (this small board's boxes are small: the block is checked on a spot with room for all of it)
          g.soaks.length = 0;
          let soak = null;
          for (let q = 0; q < pl.count && !soak; q++) {
            const idx = pl.idxOfSlot[q];
            if (idx < 0 || pl.fragments?.has(idx)) continue;
            g.splash({ pos: pl.cellCenter(idx, new window.THREE.Vector3()), target: idx, owner: p, id: -1 });
            const last = g.soaks.pop();
            if (last && last.cells.length === 18) { soak = last; g.soaks.push(last); }
          }
          if (!soak) return { fired: true, blue, landed: true, cells: 0 };
          const cells = soak.cells.slice(), hp0 = cells.map((n) => pl.strengthOf(n));
          for (let q = 0; q < 90; q++) g.update();
          const half = cells.map((n) => (pl.solid(n) ? pl.strengthOf(n) : 0));
          for (let q = 0; q < 95; q++) g.update();
          const left = cells.filter((n) => pl.solid(n)).length;
          return { fired: true, blue, lens, landed: true, cells: cells.length, weaker: half.filter((h, n) => h < hp0[n] - 0.3).length, left, size: c.size / pl.s }; }""")
        t.ok(sp.get('fired') and sp['blue'] and sp.get('lens', 0) > 0 and sp.get('size') == 3, 'a blue splasher fires a bubble of liquid 3 voxels across (a lens)', sp)
        t.ok(sp.get('landed') and sp.get('cells', 0) == 18 and sp.get('weaker', 0) >= 9, 'where it lands a 3 × 3 × 2 block soaks, weakening over time', sp)
        t.ok(sp.get('landed') and sp.get('left', 1) == 0, 'and after 3 s it is gone', sp)
        await page.evaluate("() => { const g = window.__dbg; g.localPlayer.setSetting('splashers', 0); }")
        # booster: a pink force field 5 voxels across round it; own ships inside get +20% Power (crater radius and how hard they eat)
        bo = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet, c = g.cfg.swarm.booster;
          p.setSetting('boosters', 1);
          for (let q = 0; q < 5; q++) g.update();
          const b = s.kindStart('boosters'); s.render(g.camera);
          const ic = s.mesh.instanceColor, pink = ic.getX(b) > 0.9 && ic.getY(b) < 0.5 && ic.getZ(b) > 0.5;
          const field = s.fieldMeshes[0], shown = s.fieldsShown === 1 && field.visible && field.position.distanceTo(new window.THREE.Vector3(s.pos[b * 3], s.pos[b * 3 + 1], s.pos[b * 3 + 2])) < 1e-6;
          const across = Math.round((2 * field.geometry.parameters.radius) / pl.s * 100) / 100;
          const e = s.count - 1; // an eater (the last unit)
          const put = (d) => { s.pos[e * 3] = s.pos[b * 3] + d; s.pos[e * 3 + 1] = s.pos[b * 3 + 1]; s.pos[e * 3 + 2] = s.pos[b * 3 + 2]; s.updateBoost(); return p.boostOf(e); };
          const inside = put(c.radius * 0.6), outside = put(c.radius * 1.5);
          // a bite with and without the boost: the crater radius and the damage
          const seen = [], orig = pl.biteSphere;
          pl.biteSphere = (idx, r, amount) => seen.push([r, amount]);
          g.biteCell(0, -1, p, 1); g.biteCell(0, -1, p, p.boostOf(-1) === 1 ? c.boost : 1);
          pl.biteSphere = orig;
          const r = Math.round((seen[1][0] / seen[0][0]) * 100) / 100, hard = Math.round((seen[1][1] / seen[0][1]) * 100) / 100;
          // the booster itself doesn't eat
          for (let q = 0; q < 60; q++) g.update();
          return { pink, shown, across, inside, outside, r, hard, eats: s.food[b] >= 0 }; }""")
        t.ok(bo['pink'] and bo['shown'] and bo['across'] == 5, 'a pink booster flies in a force field 5 voxels across', bo)
        t.ok(bo['inside'] == 1.2 and bo['outside'] == 1 and bo['r'] == 1.2 and bo['hard'] == 1.2 and not bo['eats'],
             'own ships inside it get +20% Power (crater radius and how hard they eat), outside not; the booster does not eat', bo)
        await page.evaluate("() => { const g = window.__dbg; g.localPlayer.setSetting('boosters', 0); }")
        # cutter: from 20 voxels a flat red sheet as wide as what it hits; it cuts the whole row, deeper until through
        ct = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet, c = g.cfg.swarm.cutter;
          p.setSetting('cutters', 1);
          const i = s.kindStart('cutters'); s.render(g.camera);
          const ic = s.mesh.instanceColor, crimson = ic.getX(i) > 0.7 && ic.getY(i) < 0.2 && ic.getZ(i) < 0.3;
          let f = 0; while (!s.cutOn[i] && f < 3000) { g.update(); f++; }
          if (!s.cutOn[i]) return { crimson, cutting: false };
          const at = [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]], left0 = pl.left, score0 = p.score;
          g.update(); s.render(g.camera);
          const L = [s.cutL[i * 3], s.cutL[i * 3 + 1], s.cutL[i * 3 + 2]], R = [s.cutR[i * 3], s.cutR[i * 3 + 1], s.cutR[i * 3 + 2]];
          const mid = L.map((v, k) => (v + R[k]) / 2), dist = Math.hypot(...mid.map((v, k) => v - at[k]));
          const sheet = s.cutsShown, width = Math.hypot(...L.map((v, k) => v - R[k]));
          let k = 0; while (s.cutOn[i] && !s.cutAfter[i] && k < 9000) { g.update(); k++; } // (through the whole Earth takes ~50 s)
          // through: for 1 s more the sheet shines on through the cut, far into space
          const throughAt = k; let after = 0, far = 0;
          while (s.cutOn[i] && after < 200) { g.update(); after++; s.render(g.camera);
            if (after === 30) far = Math.hypot(s.cutL[i * 3] - at[0], s.cutL[i * 3 + 1] - at[1], s.cutL[i * 3 + 2] - at[2]) * (s.cutsShown > 0 ? 1 : 0); }
          return { crimson, cutting: true, sheet, width, dist, reach: c.reach, eaten: left0 - pl.left, points: p.score - score0, through: !s.cutOn[i], after, far, frames: throughAt, shape: pl.shape, still: Math.hypot(s.pos[i * 3] - at[0], s.pos[i * 3 + 1] - at[1], s.pos[i * 3 + 2] - at[2]) }; }""")
        t.ok(ct.get('crimson') and ct.get('cutting') and ct.get('sheet', 0) >= 1 and ct.get('width', 0) >= 0.49 and ct.get('dist', 99) <= ct.get('reach', 0) + 2,
             'a crimson cutter locks a flat sheet on its bite from up to 20 voxels, as wide as what it hits', ct)
        t.ok(ct.get('eaten', 0) > 1 and ct.get('points', 0) > 0 and ct.get('through'), 'it cuts whole rows, deeper and deeper, until through; then it moves on', ct)
        t.ok(abs(ct.get('after', 0) - 60) <= 2 and ct.get('far', 0) > 100, 'once through, the sheet shines on through the cut into space for 1 s', ct)
        await page.evaluate("() => { const g = window.__dbg; g.localPlayer.setSetting('cutters', 0); g.start(); }")
        # Space pauses single player (nothing moves, "Paused" at the bottom) and carries on
        await page.mouse.move(500, 300)
        await page.keyboard.press('Space')
        await page.wait_for_timeout(300)
        ps = await page.evaluate("() => { const g = window.__dbg; return { paused: g.paused, frame: g.frameNo, pos: g.localPlayer.swarm.pos[0], hint: document.getElementById('pause-hint').textContent }; }")
        await page.wait_for_timeout(500)
        ps2 = await page.evaluate("() => { const g = window.__dbg; return { frame: g.frameNo, pos: g.localPlayer.swarm.pos[0] }; }")
        await page.keyboard.press('Space')
        await page.wait_for_timeout(500)
        ps3 = await page.evaluate("() => { const g = window.__dbg; return { paused: g.paused, frame: g.frameNo, hint: document.getElementById('pause-hint').hidden }; }")
        t.ok(ps['paused'] and ps2['frame'] == ps['frame'] and ps2['pos'] == ps['pos'] and 'Paused' in ps['hint'], 'Space pauses single player ("Paused" at the bottom)', {**ps, 'later': ps2})
        t.ok(not ps3['paused'] and ps3['frame'] > ps['frame'] and ps3['hint'], 'Space again carries on (and no hint about Space on the game screen)', ps3)
        # M: the solar system map during a mission — the game stands still, nothing is saved; M, Esc or "Back to it" carry on
        save0 = await page.evaluate("() => localStorage.getItem('hive-hunger-save')")
        await page.keyboard.press('m')
        await page.wait_for_timeout(400)
        mp = await page.evaluate("""() => { const g = window.__dbg; return { map: !document.getElementById('map').hidden, started: g.started, frame: g.frameNo,
          card: document.querySelector('.map-card-name')?.textContent, status: document.querySelector('.map-card-status')?.textContent,
          button: document.querySelector('.map-card .map-start')?.textContent, body: g.bodyId, save: localStorage.getItem('hive-hunger-save') }; }""")
        await page.wait_for_timeout(400)
        still = await page.evaluate('() => window.__dbg.frameNo')
        await page.keyboard.press('m')
        await page.wait_for_timeout(400)
        back1 = await page.evaluate("() => [document.getElementById('map').hidden, window.__dbg.started, window.__dbg.frameNo]")
        await page.keyboard.press('m')
        await page.keyboard.press('Escape')
        await page.wait_for_timeout(200)
        back2 = await page.evaluate("() => [document.getElementById('map').hidden, window.__dbg.started]")
        await page.keyboard.press('m')
        await page.click('.map-card .map-start')
        await page.wait_for_timeout(200)
        back3 = await page.evaluate("() => [document.getElementById('map').hidden, window.__dbg.started, window.__dbg.bodyId]")
        t.ok(mp['map'] and not mp['started'] and still == mp['frame'] and mp['status'] == 'Now playing' and mp['button'] == 'Back to it' and mp['save'] == save0,
             'M opens the map during a mission: the game stands still, the planet "Now playing", nothing saved', mp)
        t.ok(back1[0] and back1[1] and back1[2] > still and back2 == [True, True] and back3 == [True, True, mp['body']],
             'M, Esc and "Back to it" go back to the same mission', [back1, back2, back3])
        frames = {}
        for kind in ("laser", "eater"):
            aim = await page.evaluate(AIM, kind == "laser")
            t.ok(aim.get('found') and aim['turning']['aimed'] == 0 and aim['turning']['firing'] == 0 and aim['turning']['hp'] == aim['hp0'],
                 f'a {kind} ship does not eat while it turns towards its bite', aim)
            t.ok(aim.get('aimedLater') == 1 and 5 < aim.get('frames', 0) < 60, f'a {kind} ship eats once it faces its bite', aim)
            frames[kind] = aim.get('frames', 0)
        # slower turning (setting `turn`) → it takes longer to face the bite
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('turn', 0.04)")
        slow = await page.evaluate(AIM, True)
        t.ok(slow.get('found') and slow['frames'] > 2 * frames['laser'], 'slower turning: ships take longer to face their bite', f"{frames['laser']} → {slow['frames']} frames")
        await page.evaluate("() => window.__dbg.localPlayer.setSetting('turn', window.__dbg.cfg.swarm.turnSmoothing)")
        await page.evaluate('() => window.__dbg.jumpToLevel(1)')
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

        # the mission is done: once the ships are gone, back to the map — the belt ticked, the next mission marked
        dn = await page.evaluate("""() => { const g = window.__dbg; let f = 0;
          while (document.getElementById('map').hidden && f < 1500) { g.update(); f++; } }""")
        await page.wait_for_timeout(300)  # (the map draws its labels)
        dn = await page.evaluate("""() => { const g = window.__dbg;
          return { map: !document.getElementById('map').hidden, started: g.started, card: document.querySelector('.map-card-name')?.textContent,
            status: document.querySelector('.map-card-status')?.textContent, done: [...document.querySelectorAll('.map-label.is-done')].map((e) => e.textContent),
            saved: localStorage.getItem('hive-hunger-progress') }; }""")
        t.ok(dn['map'] and not dn['started'] and dn['card'] == NEXT and dn['status'] == 'Next mission' and dn['done'] == ['Kuiper Belt'] and 'kuiper' in (dn['saved'] or ''),
             f'mission done: back to the map, the belt ticked (and remembered), {NEXT} next', dn)
        # … and the game is saved there (the tick, the points and upgrades together), with a note on the map
        au = await page.evaluate("""() => { const s = JSON.parse(localStorage.getItem('hive-hunger-save') || 'null'), n = document.querySelector('.map-note');
          return { saved: Boolean(s), mission: s && s.mission, score: s && s.score, now: window.__dbg.localPlayer.score, note: n && !n.hidden ? n.textContent : '' }; }""")
        t.ok(au['saved'] and au['mission'] is None and au['score'] == au['now'] and au['score'] > 0 and au['note'] == 'Kuiper Belt done · game saved',
             'mission done: the game is saved by itself ("Kuiper Belt done · game saved")', au)
        # leave without saving and come back: Continue has the points; New game asks first (No keeps the save)
        await page.click('.map-back')
        await page.evaluate("() => { window.__dbg.resetProgress(); }")  # (nothing of it left in memory)
        await page.click('.menu-choice >> nth=0')
        await page.click('#menu .menu-choice >> text=New game')
        q = await page.evaluate("() => [document.querySelector('#menu .menu-note')?.textContent, [...document.querySelectorAll('#menu .lobby-button')].map((b) => b.textContent)]")
        await page.click('#menu .menu-no')
        kept = await page.evaluate("() => [Boolean(localStorage.getItem('hive-hunger-save')), Boolean(localStorage.getItem('hive-hunger-progress'))]")
        t.ok(q[0] == 'Delete your saved game and start a new one?' and 'Delete it and start a new game' in q[1] and 'No' in q[1] and kept == [True, True],
             'New game with a saved game asks first; No keeps the save', [q, kept])
        await page.click('.menu-choice >> nth=0')
        await page.click('#menu .menu-choice >> text=Continue')
        await page.wait_for_timeout(300)
        cb = await page.evaluate("() => ({ map: !document.getElementById('map').hidden, card: document.querySelector('.map-card-name')?.textContent, score: window.__dbg.localPlayer.score, done: [...document.querySelectorAll('.map-label.is-done')].map((e) => e.textContent) })")
        t.ok(cb['map'] and cb['card'] == NEXT and cb['score'] == au['score'] and cb['done'] == ['Kuiper Belt'], f'Continue after a mission: the map with the belt ticked, {NEXT} next, the points back', cb)
        await page.click('.map-start')
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

        # New game, Yes: the save and the ticks are gone, the map starts again from the Kuiper Belt
        await page.evaluate("() => { const g = window.__dbg; let f = 0; while (document.getElementById('map').hidden && f < 1500) { g.update(); f++; } }")
        await page.wait_for_timeout(300)
        await page.click('.map-back')
        await page.click('.menu-choice >> nth=0')
        await page.click('#menu .menu-choice >> text=New game')
        await page.click('#menu .menu-yes')
        await page.wait_for_timeout(300)
        ng = await page.evaluate("() => ({ save: localStorage.getItem('hive-hunger-save'), ticks: localStorage.getItem('hive-hunger-progress'), map: !document.getElementById('map').hidden, card: document.querySelector('.map-card-name')?.textContent, score: window.__dbg.localPlayer.score })")
        t.ok(ng['save'] is None and ng['map'] and ng['card'] == 'Kuiper Belt' and ng['score'] == 0 and 'kuiper' not in (ng['ticks'] or ''),
             'New game, Yes: the save and the ticks are gone, the map starts from the Kuiper Belt', ng)

        # Dev tools (start screen): the three editors (new tabs) and the test board
        await page.click('.map-back')
        await page.click('.menu-dev')
        dv = await page.evaluate("() => ({ title: document.getElementById('menu-title').textContent, tools: [...document.querySelectorAll('.menu-tools .menu-choice-label')].map((e) => e.textContent) })")
        t.ok(dv['title'] == 'Dev tools' and dv['tools'] == ['Ship editor', 'Tree editor', 'Voxel editor', 'Test board'], 'Dev tools: ship, tree and voxel editors, test board', dv)
        async with page.context.expect_page() as tab:
            await page.click('.menu-tools .menu-choice >> text=Voxel editor')
        vt = await tab.value
        await vt.wait_for_load_state()
        t.ok(vt.url.endswith('tools/voxel-editor.html'), 'an editor opens in a new tab', vt.url)
        await vt.close()
        await page.keyboard.press('Escape')
        t.ok((await page.text_content('#menu-title')).startswith('Hive Hunger'), 'Esc goes back from Dev tools')
        await page.click('.menu-dev')
        await page.click('.menu-test')
        await page.wait_for_timeout(300)
        tb = await page.evaluate("""() => { const g = window.__dbg, p = g.localPlayer, s = p.swarm, pl = g.planet;
          const r = { body: g.bodyId, R: pl.R, started: g.started, count: s.count, each: ['lasers', 'cutters', 'boosters'].map((k) => s[k]),
            hud: document.querySelector('.hud')?.textContent || '', shape: pl.shape };
          // the balls: 4, each 10 voxels across, each in its own colour
          const ext = new Map();
          for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) {
            const t = pl.tags[idx], [i, j, k] = pl.coords(idx), e = ext.get(t) || { i0: 1e9, i1: -1, n: 0 };
            e.i0 = Math.min(e.i0, i); e.i1 = Math.max(e.i1, i); e.n++; ext.set(t, e);
          }
          r.balls = [...ext.values()].map((e) => e.i1 - e.i0 + 1);
          r.colours = new Set([...ext.keys()].map((t) => pl.tagColors[t].join(','))).size;
          // water and lava: a voxel destroyed is let loose as a droplet — no point for it; only siphons collect them, a point each
          const L = g.liquids, v = new window.THREE.Vector3(), score0 = p.score;
          let cleared = 0;
          for (let idx = 0; idx < pl.hp.length && cleared < 30; idx++) if (pl.hp[idx] > 0 && (pl.tags[idx] === 2 || pl.tags[idx] === 4)) {
            pl.cellCenter(idx, v); cleared += g.clearCell(v.x, v.y, v.z, p); }
          g.update();
          r.liquid = { cleared, drops: L.count, points: p.score - score0, kinds: new Set(Array.from(L.kind.slice(0, L.count))).size };
          // their moving looks: the surface knows where water and lava are, every drop has its own seed, the clock runs
          pl.surface.sync(true);
          let water = 0, lava = 0;
          for (const m of pl.surface.meshes.values()) { const a = m.geometry.attributes.liquid; if (a) for (let k = 0; k < a.count; k++) { water = Math.max(water, a.getX(k)); lava = Math.max(lava, a.getY(k)); } }
          r.liquid.look = { water, lava, seeds: new Set(Array.from(L.seed.slice(0, L.count)).map((x) => x.toFixed(4))).size };
          // a piece of lava come loose: it moves like the ball (its surface has the lava look too)
          const slab = []; for (let idx = 0; idx < pl.hp.length && slab.length < 12; idx++) if (pl.hp[idx] > 0 && pl.tags[idx] === 4) slab.push(idx);
          const piece = pl.fragments.create(slab); piece.surface.sync(true);
          let pieceLava = 0; for (const m of piece.surface.meshes.values()) { const a = m.geometry.attributes.liquid; if (a) for (let k = 0; k < a.count; k++) pieceLava = Math.max(pieceLava, a.getY(k)); }
          r.liquid.look.piece = pieceLava;
          for (let f = 0; f < 120; f++) g.update();
          r.liquid.held = L.count; // (they float about: nobody takes them in)
          p.buyShips('siphons', 3);
          const score1 = p.score;
          let lf = 0; for (; lf < 4000 && L.count > 0; lf++) g.update();
          r.liquid.left = L.count; r.liquid.taken = p.score - score1; r.liquid.frames = lf;
          p.sellShips('siphons', 3); for (let k = 0; k < 120; k++) g.update();
          // solid gas destroyed: a patchy cloud (puffs of their own size, colour and pattern), no points, only scoops take it in
          const G = g.gases, score2 = p.score;
          let gasCleared = 0;
          for (let idx = 0; idx < pl.hp.length && gasCleared < 30; idx++) if (pl.hp[idx] > 0 && pl.tags[idx] === 5) { pl.cellCenter(idx, v); gasCleared += g.clearCell(v.x, v.y, v.z, p); }
          g.update();
          r.gas = { cleared: gasCleared, puffs: G.count, points: p.score - score2, seeds: new Set(Array.from(G.seed.slice(0, G.count)).map((x) => x.toFixed(4))).size,
            sizes: new Set(Array.from(G.size.slice(0, G.count)).map((x) => x.toFixed(3))).size };
          let fastest = 0;
          for (let k = 0; k < 120; k++) { g.update(); for (let i = 0; i < G.count; i++) fastest = Math.max(fastest, Math.hypot(G.vel[i * 3], G.vel[i * 3 + 1], G.vel[i * 3 + 2])); }
          r.gas.fastest = +fastest.toFixed(4);
          r.gas.held = G.count; r.gas.liquidNotTaken = L.count;
          // its solid look: the gas ball's surface knows it is gas
          let gasLook = 0; for (const m of pl.surface.meshes.values()) { const a = m.geometry.attributes.liquid; if (a) for (let k = 0; k < a.count; k++) gasLook = Math.max(gasLook, a.getZ(k)); }
          r.gas.look = gasLook;
          p.buyShips('scoops', 3);
          const score3 = p.score;
          let gf = 0; for (; gf < 6000 && G.count > 0; gf++) g.update();
          r.gas.left = G.count; r.gas.taken = p.score - score3;
          p.sellShips('scoops', 3); for (let k = 0; k < 120; k++) g.update();
          g.stop();
          for (let idx = 0; idx < pl.hp.length; idx++) if (pl.hp[idx] > 0) pl.remove(idx);
          for (const f of [...(pl.fragments?.list || [])]) for (const c of pl.fragments.cellsOf(f)) pl.remove(c);
          // every voxel gone, but droplets and gas still float: not over yet — siphons and scoops take them in first
          for (let k = 0; k < 600; k++) g.update();
          r.waiting = { over: g.boardsEaten, left: pl.left, drops: L.count, puffs: G.count, alive: pl.alive };
          p.buyShips('siphons', 8); p.buyShips('scoops', 8);
          let f = 0; while (g.boardsEaten < 1 && f < 40000) { g.update(); f++; }
          r.waiting.frames = f;
          r.again = g.boardsEaten; r.alive = g.planet.alive && g.planet !== pl; r.body2 = g.planet.shape; r.started2 = g.started;
          r.map = !document.getElementById('map').hidden; r.save = localStorage.getItem('hive-hunger-save'); r.ticks = localStorage.getItem('hive-hunger-progress');
          g.start(); return r; }""")
        t.ok(tb['shape'] == 'balls' and tb['balls'] == [10, 10, 10, 10, 10] and tb['colours'] == 5 and tb['started'] and tb['count'] == 0
             and tb['each'] == [0, 0, 0] and 'Test board' in tb['hud'],
             'Test board: 5 balls 10 voxels across, each in its own colour (rock, water, iron, gas, lava), no ships at the start', tb)
        lq = tb['liquid']
        t.ok(lq['cleared'] == 30 and lq['drops'] == 30 and lq['points'] == 0 and lq['held'] == 30,
             'water and lava destroyed: droplets floating in space, no points for them, nobody else takes them in', lq)
        t.ok(lq['left'] == 0 and lq['taken'] == 30, 'siphons take them all in, a point each', lq)
        gs = tb['gas']
        t.ok(gs['cleared'] == 30 and gs['puffs'] == 30 and gs['points'] == 0 and gs['held'] == 30 and gs['seeds'] >= 25 and gs['sizes'] > 10 and gs['look'] == 1,
             'solid gas (its own moving look) destroyed: a patchy cloud of puffs, each its own, no points, nobody else takes it in', gs)
        t.ok(gs['fastest'] <= 0.0061, 'the cloud drifts lazily: no puff faster than gas.maxSpeed (0.006 a frame)', gs)
        t.ok(gs['left'] == 0 and gs['taken'] == 30, 'scoops take the whole cloud in, a point each', gs)
        t.ok(lq['look']['water'] == 1 and lq['look']['lava'] == 1 and lq['look']['seeds'] == 30 and lq['look']['piece'] == 1,
             'water and lava have their own moving look on the balls and on pieces come loose; every droplet a different one', lq['look'])
        t.ok(tb['again'] == 1 and tb['alive'] and tb['body2'] == 'balls' and tb['started2'] and not tb['map'] and tb['save'] is None and 'earth' not in (tb['ticks'] or ''),
             'eaten, it is there again at once — no map, nothing saved, no tick', tb)
        wt = tb['waiting']
        t.ok(wt['over'] == 0 and wt['left'] == 0 and wt['drops'] > 0 and wt['puffs'] > 0 and wt['alive'] and tb['again'] == 1,
             'every voxel gone but droplets and gas still in space: not over until siphons and scoops have taken them all in', wt)
        await page.keyboard.press('Escape')
        pz = await page.evaluate("() => [...document.querySelectorAll('#menu .menu-choice-label')].map((e) => e.textContent)")
        await page.click('#menu .menu-choice >> text=Exit to main menu')
        back = await page.evaluate("() => { const g = window.__dbg, s = g.localPlayer.swarm; return [g.testBoard, s.count, s.lasers, g.localPlayer.score]; }")
        t.ok('Save game' not in pz and 'Save and exit' not in pz and back == [False, 3, 0, 0],
             'its Esc menu has no saving; Exit to main menu puts the ships back (3 eaters)', [pz, back])

        await browser.close()
    return t.done(errors)


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
