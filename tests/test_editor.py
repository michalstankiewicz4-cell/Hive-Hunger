"""The ship editor (tools/ship-editor.html): every ship and the whole swarm with the game's values,
changing a value, the order of tasks, a non-standard task, the priority, notes; kept after a reload;
Export (a JSON file with every change), Import, Reset all.

Run from the repository root:  python tests/test_editor.py"""

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
    url = h.start_static_server().replace('index.html', 'tools/ship-editor.html')
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=h.BROWSER_ARGS)
        ctx = await browser.new_context(accept_downloads=True, viewport={'width': 1200, 'height': 800})
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.goto(url)
        await page.wait_for_function('window.__editor !== undefined')

        nav = await page.eval_on_selector_all('nav button[data-sec]', 'bs => bs.map(b => b.dataset.sec)')
        check('the whole swarm, eaters and 13 ship types', len(nav) == 15 and nav[0] == 'swarm' and 'cutter' in nav, str(nav))
        v = await page.evaluate("() => ({ reach: __editor.sections.laser.values.reach, w: __editor.sections.swarm.values['weights.separation'] })")
        check('values read from the game', v['reach'] == 2.5 and v['w'] == 1.8, str(v))

        # a value
        await page.click('nav button[data-sec="laser"]')
        row = page.locator('tr', has=page.locator('td.key', has_text='reach')).first
        await row.locator('input').fill('4')
        check('a changed value is marked', 'changed' in (await row.get_attribute('class') or ''))

        # tasks: move the last up, switch one off, add a standard and a non-standard one
        tasks = page.locator('section.box', has_text='Tasks, in order')
        n0 = await tasks.locator('ol.steps li').count()
        await tasks.locator('ol.steps li').nth(n0 - 1).locator('button[title="Earlier"]').click()
        tasks = page.locator('section.box', has_text='Tasks, in order')
        await tasks.locator('ol.steps li').nth(0).locator('input[type=checkbox]').uncheck()
        tasks = page.locator('section.box', has_text='Tasks, in order')
        await tasks.locator('.addrow select').select_option('drill')
        tasks = page.locator('section.box', has_text='Tasks, in order')
        await tasks.locator('.addrow input[type=text]').fill('Circle the bite before firing')
        await tasks.locator('.addrow button', has_text='Add').click()
        tasks = page.locator('section.box', has_text='Tasks, in order')
        n1 = await tasks.locator('ol.steps li').count()
        custom = await tasks.locator('ol.steps li.custom').count()
        check('tasks reordered, switched off, standard and own added', n1 == n0 + 2 and custom == 1, f'{n0} → {n1}')

        # priority: add one
        targets = page.locator('section.box', has_text='Goes for (priority)')
        await targets.locator('.addrow select').select_option('pieces')
        await page.fill('textarea', 'Should be faster')
        await page.wait_for_timeout(400)

        # kept after a reload
        await page.reload()
        await page.wait_for_function('window.__editor !== undefined')
        st = await page.evaluate('() => __editor.state()')
        check('kept after a reload', st['values'].get('laser', {}).get('reach') == 4 and len(st['ships']['laser']['tasks']) == n1
              and st['ships']['laser']['notes'] == 'Should be faster', json.dumps(st)[:200])

        # export
        async with page.expect_download() as dl:
            await page.click('#export')
        path = await (await dl.value).path()
        data = json.load(open(path, encoding='utf-8'))
        ch = data['changes']
        laser = data['ships']['laser']
        check('export: the change with the game value and its path',
              ch == [{'ship': 'Lasers', 'section': 'laser', 'path': 'swarm.laser.reach', 'from': 2.5, 'to': 4}], str(ch))
        check('export: tasks (standard and own, on/off, the game\'s order), priority, notes',
              any(not t['standard'] and t['task'] == 'Circle the bite before firing' for t in laser['tasks'])
              and any(t['on'] is False for t in laser['tasks']) and len(laser['tasksInGame']) == n0
              and laser['targets'][-1]['target'].startswith('Drifting pieces') and laser['notes'] == 'Should be faster',
              json.dumps(laser)[:300])
        check('export: the game version', bool(data['version']))

        # Polish: the switch in the header, remembered; every text in Polish (the export stays in English)
        # (every text on the page has a Polish one)
        untranslated = await page.evaluate("""() => { const out = new Set();
          for (const sec of Object.keys(__editor.sections)) {
            __editor.select(sec);
            for (const e of document.querySelectorAll('header h1, nav h3, nav span, main h3, main .hint, main td.note, main .label, main small, main option, main th, main .desc, main button, main summary')) {
              const t = (e.firstChild && e.firstChild.nodeType === 3 ? e.firstChild.textContent : e.textContent).trim().replace(/^\\d+ /, '');
              if (/[A-Za-z]{2,}/.test(t) && !__editor.english.has(t)) out.add(t);
            }
          }
          return [...out]; }""")
        check('every text has a Polish one', not untranslated, str(untranslated[:10]))
        await page.click('#lang-pl')
        pl = await page.evaluate("""async () => { const out = {}; out.h1 = document.querySelector('header h1').textContent;
          out.nav = [...document.querySelectorAll('nav button span:nth-child(2)')].map((e) => e.textContent);
          const missing = new Set();
          for (const sec of Object.keys(__editor.sections)) {
            __editor.select(sec);
            for (const e of document.querySelectorAll('main h3, main .hint, main td.note, main .label, main small, main option, main th, main .desc, main button')) {
              const t = (e.firstChild && e.firstChild.nodeType === 3 ? e.firstChild.textContent : e.textContent).trim();
              if (t && __editor.english.has(t) && __editor.english.get(t) !== t) missing.add(t); // still the English text
            }
          }
          out.missing = [...missing];
          return out; }""")
        check('Polish: the header and the ships', pl['h1'] == 'Hive Hunger — edytor statków' and 'Zjadacze' in pl['nav'] and 'Cały rój' in pl['nav'], str(pl['nav'][:4]))
        check('Polish: no text left in English', not pl['missing'], str(pl['missing'][:8]))
        await page.reload()
        await page.wait_for_function('window.__editor !== undefined')
        check('the language is remembered', await page.text_content('header h1') == 'Hive Hunger — edytor statków')
        async with page.expect_download() as dl2:
            await page.click('#export')
        d2 = json.load(open(await (await dl2.value).path(), encoding='utf-8'))
        check('the export stays in English', d2['ships']['laser']['tasks'][0]['task'] == 'Pick a bite', d2['ships']['laser']['tasks'][0]['task'])
        await page.click('#lang-en')

        # reset all, then import the file back
        page.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await page.click('#reset-all')
        await page.wait_for_timeout(300)
        st = await page.evaluate('() => __editor.state()')
        check('reset all', st == {'values': {}, 'ships': {}}, str(st))
        await page.set_input_files('#file', path)
        await page.wait_for_timeout(500)
        st = await page.evaluate('() => __editor.state()')
        check('import brings the changes back', st['values'].get('laser', {}).get('reach') == 4 and 'laser' in st['ships'])

        check('no page errors', not errors, str(errors[:3]))
        await browser.close()
    sys.exit(0 if all(results) else 1)


asyncio.run(main())
