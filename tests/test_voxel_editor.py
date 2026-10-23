"""The voxel editor (tools/voxel-editor.html): rock (the game today), water, iron and lava to start from;
editing a kind (name, colour, strength, points, which ships eat it, behaviour, where, on which bodies,
in your own words); adding and deleting a kind (rock stays); kept after a reload; Export, Import,
Reset all; EN / PL.

Run from the repository root:  python tests/test_voxel_editor.py"""

import asyncio
import json
import sys

from playwright.async_api import async_playwright

import harness as h

results = []


def check(name, ok, info=''):
    results.append(ok)
    print(('PASS' if ok else 'FAIL'), name, info)


async def main():
    url = h.start_static_server().replace('index.html', 'tools/voxel-editor.html')
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=h.BROWSER_ARGS)
        ctx = await browser.new_context(accept_downloads=True, viewport={'width': 1300, 'height': 1000})
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.goto(url)
        await page.wait_for_function('window.__voxelEditor !== undefined')

        st = await page.evaluate("() => __voxelEditor.state().kinds.map((k) => [k.id, k.strength, k.points, k.ships.length])")
        check('rock (the game today: strength 1, 1 point, every ship), water, iron, lava and gas',
              [k[0] for k in st] == ['rock', 'water', 'iron', 'lava', 'gas'] and st[0][1:] == [1, 1, 16], str(st))

        # edit lava
        await page.click('nav [data-kind=lava]')
        await page.fill('[data-f=strength]', '3')
        await page.fill('[data-f=points]', '5')
        await page.click('[data-f=ships] input[value=eaters]')            # eaters can't eat it
        await page.click('[data-f=flags] input[value=flows]')
        await page.click('[data-f=flags] input[value=hurts]')
        await page.click('[data-f=where] input[value=pools]')
        await page.click('[data-f=bodies] input[value=earth]')
        await page.fill('[data-f=amount]', '4')
        await page.fill('[data-f=wish]', 'Burns ships that land on it')
        lava = await page.evaluate("() => __voxelEditor.state().kinds.find((k) => k.id === 'lava')")
        check('a kind edited: strength, points, ships, behaviour, where, bodies, own words',
              lava['strength'] == 3 and lava['points'] == 5 and 'eaters' not in lava['ships'] and len(lava['ships']) == 15
              and lava['flags'] == ['flows', 'hurts'] and lava['where'] == ['pools'] and lava['bodies'] == ['earth'] and lava['amount'] == 4
              and lava['wish'] == 'Burns ships that land on it', json.dumps(lava)[:300])

        # add a kind, delete iron, rock can't go
        await page.click('#add-kind')
        await page.fill('[data-f=name]', 'Gold')
        page.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await page.click('nav [data-kind=iron]')
        await page.click('main .danger')
        await page.wait_for_timeout(200)
        await page.click('nav [data-kind=rock]')
        await page.click('main .danger')
        ids = await page.evaluate("() => __voxelEditor.state().kinds.map((k) => k.id + ':' + k.name)")
        check('a kind added, one deleted; rock stays', ids == ['rock:Rock', 'water:Water', 'lava:Lava', 'gas:Gas', 'kind1:Gold'], str(ids))
        await page.wait_for_timeout(400)

        await page.reload()
        await page.wait_for_function('window.__voxelEditor !== undefined')
        kept = await page.evaluate("() => __voxelEditor.state().kinds.map((k) => k.id)")
        check('kept after a reload', kept == ['rock', 'water', 'lava', 'gas', 'kind1'], str(kept))

        async with page.expect_download() as dl:
            await page.click('#export')
        path = await (await dl.value).path()
        data = json.load(open(path, encoding='utf-8'))
        ch = data['changes']
        fields = {(c['id'], c['field']) for c in ch['changed']}
        check('export: added, removed, changed fields and every kind',
              ch['added'] == ['kind1'] and ch['removed'] == ['iron'] and ('lava', 'strength') in fields and ('lava', 'wish') in fields
              and len(data['kinds']) == 5 and data['version'], json.dumps(ch)[:300])

        # every text has a Polish one (body names stay as they are); the switch
        bodies = await page.evaluate("async () => (await import('../js/solar.js')).SOLAR.map((b) => b.name)")
        untranslated = await page.evaluate("""(bodies) => { const out = new Set(), en = __voxelEditor.english;
          for (const id of ['rock', 'lava']) { __voxelEditor.select(id);
            for (const e of document.querySelectorAll('header button, nav button span:nth-child(2), #add-kind, main h2 span, main .desc, main h3, main label.f > span, main .checks span, main button')) {
              const t = (e.firstChild && e.firstChild.nodeType === 3 ? e.firstChild.textContent : e.textContent).trim();
              if (/[A-Za-z]{2,}/.test(t) && !en.has(t) && !/^(EN|PL|Gold)$/.test(t) && !bodies.includes(t)) out.add(t); } }
          return [...out]; }""", bodies)
        check('every text has a Polish one (body names stay)', not untranslated, str(untranslated[:10]))
        await page.click('#lang-pl')
        plt = await page.evaluate("() => [document.getElementById('h1').textContent, document.querySelector('nav [data-kind=rock] span:nth-child(2)').textContent]")
        check('Polish: the switch', plt == ['Hive Hunger — edytor voxeli', 'Skała'], str(plt))
        await page.click('#lang-en')

        page.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await page.click('#reset-all')
        await page.wait_for_timeout(300)
        d0 = await page.evaluate('() => __voxelEditor.diff()')
        check('reset all', not d0['added'] and not d0['removed'] and not d0['changed'], json.dumps(d0))
        await page.set_input_files('#file', path)
        await page.wait_for_timeout(500)
        back = await page.evaluate("() => __voxelEditor.state().kinds.map((k) => k.id)")
        check('import brings it all back', back == ['rock', 'water', 'lava', 'gas', 'kind1'], str(back))

        check('no page errors', not errors, str(errors[:3]))
        await browser.close()
    sys.exit(0 if all(results) else 1)


asyncio.run(main())
