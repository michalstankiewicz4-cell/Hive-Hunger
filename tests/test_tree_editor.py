"""The tree editor (tools/tree-editor.html): the game's tree; selecting a node shows it and lights up its links;
editing a node (name, ship, what should be there in your own words, cost, level), a colour from the palette of 16;
adding a node on a level; connecting two nodes and removing the link; dragging a node; deleting one; a branch's
colour; kept after a reload; Export (a JSON file with the tree and every change), Import, Reset all; EN / PL.

Run from the repository root:  python tests/test_tree_editor.py"""

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
    url = h.start_static_server().replace('index.html', 'tools/tree-editor.html')
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=h.BROWSER_ARGS)
        ctx = await browser.new_context(accept_downloads=True, viewport={'width': 1400, 'height': 860})
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.goto(url)
        await page.wait_for_function('window.__treeEditor !== undefined')

        async def screen(id):
            return await page.evaluate("(id) => { const r = __treeEditor.canvas.getBoundingClientRect(), p = __treeEditor.posOf(id); return [r.left + p.x, r.top + p.y]; }", id)

        st = await page.evaluate("() => { const s = __treeEditor.state(); return { n: s.nodes.length, ships: s.nodes.filter((n) => n.kind === 'ship').length, palette: __treeEditor.PALETTE.length }; }")
        check("the game's tree (14 ships) and a palette of 16", st['ships'] == 14 and st['n'] > 50 and st['palette'] == 16, str(st))

        # select: the panel and the lit links
        x, y = await screen('lasers')
        await page.mouse.click(x, y)
        sel = await page.evaluate("() => [document.querySelector('#side h2 span:nth-child(2)').textContent, __treeEditor.view.lit]")
        check('clicking a node shows it and lights up its links', sel[0] == 'Lasers' and sel[1] >= 2, str(sel))

        # edit: name, cost, ship, own words, colour
        await page.fill('#side [data-f=name]', 'Red lasers')
        await page.fill('#side [data-f=wish]', 'Two beams at once')
        await page.fill('#side [data-f=cost]', '250')
        await page.locator('#side .palette .swatch:not(.none)').nth(2).click()
        n = await page.evaluate("() => __treeEditor.state().nodes.find((n) => n.id === 'lasers')")
        check('a node edited: name, own words, cost, colour from the palette',
              n['name'] == 'Red lasers' and n['wish'] == 'Two beams at once' and n['cost'] == 250 and n['color'], json.dumps(n)[:200])

        # add a node on a level
        await page.click('#m-add')
        await page.select_option('#add-kind', 'ship')
        cx, cy = await page.evaluate("() => { const r = __treeEditor.canvas.getBoundingClientRect(), v = __treeEditor.view; return [r.left + v.cx + 2.5 * v.ring * 0.0, r.top + v.cy - (3 + 0.45) * v.ring]; }")
        await page.mouse.click(cx, cy)
        new = await page.evaluate("() => __treeEditor.state().nodes.find((n) => n.id.startsWith('new'))")
        check('a node added where clicked (level 3, a ship)', new and new['depth'] == 3 and new['kind'] == 'ship' and new['parents'] == ['lasers'], json.dumps(new))
        # pick a ship for it
        await page.select_option('#side [data-f=ship]', 'cutters')
        # connect: parent drills → the new node, then again to remove it
        await page.click('#m-link')
        for nid in ('drills', new['id']):
            x, y = await screen(nid)
            await page.mouse.click(x, y)
        linked = await page.evaluate("(id) => __treeEditor.state().nodes.find((n) => n.id === id).parents", new['id'])
        for nid in ('drills', new['id']):
            x, y = await screen(nid)
            await page.mouse.click(x, y)
        unlinked = await page.evaluate("(id) => __treeEditor.state().nodes.find((n) => n.id === id).parents", new['id'])
        check('connecting two nodes, and the same two again removes the link', linked == ['lasers', 'drills'] and unlinked == ['lasers'], str([linked, unlinked]))
        for nid in ('drills', new['id']):
            x, y = await screen(nid)
            await page.mouse.click(x, y)
        await page.click('#m-select')
        # drag a node to another level
        x, y = await screen('orbs')
        before = await page.evaluate("() => __treeEditor.state().nodes.find((n) => n.id === 'orbs').depth")
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x, y - 60, steps=5)
        await page.mouse.up()
        after = await page.evaluate("() => __treeEditor.state().nodes.find((n) => n.id === 'orbs').depth")
        check('dragging a node moves it to another level', after > before, f'{before} → {after}')
        # delete a node: its links go too
        await page.evaluate("() => __treeEditor.select('n-double')")
        page.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await page.click('#side .danger')
        await page.wait_for_timeout(200)
        gone = await page.evaluate("() => !__treeEditor.state().nodes.some((n) => n.id === 'n-double')")
        check('a node deleted', gone)
        # a branch colour
        await page.locator('#side .branch .dot').nth(1).click()
        await page.locator('#side .branches .palette .swatch:not(.none)').nth(5).click()
        bc = await page.evaluate("() => __treeEditor.state().branchColors")
        check("a branch's colour from the palette", len(bc) == 1, str(bc))
        await page.wait_for_timeout(400)

        await page.reload()
        await page.wait_for_function('window.__treeEditor !== undefined')
        kept = await page.evaluate("() => { const s = __treeEditor.state(); return [s.nodes.find((n) => n.id === 'lasers').name, s.nodes.some((n) => n.id.startsWith('new'))]; }")
        check('kept after a reload', kept == ['Red lasers', True], str(kept))

        async with page.expect_download() as dl:
            await page.click('#export')
        path = await (await dl.value).path()
        data = json.load(open(path, encoding='utf-8'))
        ch = data['changes']
        fields = {(c['id'], c['field']) for c in ch['changed']}
        check('export: every change (added, removed, fields, links, colours) and the whole tree',
              len(ch['added']) == 1 and ch['removed'] == ['n-double'] and ('lasers', 'name') in fields and ('lasers', 'cost') in fields
              and ('lasers', 'wish') in fields and ('orbs', 'depth') in fields and len(ch['branchColors']) == 1
              and ['drills', ch['added'][0]] in ch['linksAdded'] and ['lasers', ch['added'][0]] in ch['linksAdded']
              and any(n.get('ship') == 'cutters' for n in data['nodes']) and data['version'], json.dumps(ch)[:300])

        # Polish: every text has a Polish one
        untranslated = await page.evaluate("""() => { const out = new Set(), en = __treeEditor.english;
          __treeEditor.select('lasers');
          for (const e of document.querySelectorAll('header button, .tools button, .tools .hint, .tools option, #side h3, #side .hint, #side label.f > span, #side option, #side button, #side .chk span, #side .branch span')) {
            const t = e.textContent.trim(); if (/[A-Za-z]{2,}/.test(t) && !en.has(t) && t !== 'Red lasers' && !/^(EN|PL)$/.test(t)) out.add(t); }
          return [...out]; }""")
        check('every text has a Polish one', not untranslated, str(untranslated[:10]))
        await page.click('#lang-pl')
        plt = await page.evaluate("() => [document.getElementById('h1').textContent, document.getElementById('m-add').textContent]")
        check('Polish: the switch', plt == ['Hive Hunger — edytor drzewka', 'Dodaj węzeł'], str(plt))
        await page.click('#lang-en')

        page.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await page.click('#reset-all')
        await page.wait_for_timeout(300)
        d0 = await page.evaluate('() => __treeEditor.diff()')
        check('reset all', not d0['added'] and not d0['removed'] and not d0['changed'], json.dumps(d0)[:200])
        await page.set_input_files('#file', path)
        await page.wait_for_timeout(500)
        back = await page.evaluate("() => __treeEditor.state().nodes.find((n) => n.id === 'lasers').name")
        check('import brings it all back', back == 'Red lasers', back)

        check('no page errors', not errors, str(errors[:3]))
        await browser.close()
    sys.exit(0 if all(results) else 1)


asyncio.run(main())
