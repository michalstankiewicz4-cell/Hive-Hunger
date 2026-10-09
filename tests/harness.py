"""Shared helpers for the browser tests: a static server for the game, a local PeerJS
server, and pages that load Three.js / PeerJS from tests/node_modules instead of the CDNs.

The game exposes nothing global, so every page gets `window.__dbg = game` by rewriting
js/main.js on the fly (the files in the repository stay untouched)."""

import functools
import http.server
import os
import subprocess
import threading
import time
import socket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS = os.path.join(ROOT, 'tests')
NODE_MODULES = os.path.join(TESTS, 'node_modules')
THREE = os.path.join(NODE_MODULES, 'three', 'build', 'three.min.js')
PEERJS = os.path.join(NODE_MODULES, 'peerjs', 'dist', 'peerjs.min.js')
PEER_PORT = int(os.environ.get('PEER_PORT', 9000))
PEER_OPTIONS = ("window.HIVE_PEER_OPTIONS={host:'127.0.0.1',port:%d,path:'/peerjs',secure:false,"
                "config:{iceServers:[]}};" % PEER_PORT)
BROWSER_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start_static_server():
    """Serves the repository root; returns the base URL."""
    port = free_port()
    handler = functools.partial(Quiet, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{port}/index.html'


def start_peer_server():
    """Starts tests/peer-server.js and waits until it listens; returns the process."""
    proc = subprocess.Popen(['node', os.path.join(TESTS, 'peer-server.js')], cwd=TESTS,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                            env={**os.environ, 'PEER_PORT': str(PEER_PORT)})
    line = proc.stdout.readline()
    if 'peer server' not in line:
        proc.kill()
        raise RuntimeError(f'peer server did not start: {line}')
    return proc


def check_setup():
    for path in (THREE, PEERJS):
        if not os.path.exists(path):
            raise SystemExit(f'Missing {path}. Run `npm install` in tests/ first.')


async def open_page(browser, url, errors, tag, peer=False):
    """A game page with local libraries, the debug hook and console errors collected."""
    page = await browser.new_page(viewport={'width': 1000, 'height': 640})
    page.on('pageerror', lambda e: errors.append(f'{tag}: {e}'))
    page.on('console', lambda m: errors.append(f'{tag} console: {m.text}') if m.type == 'error' else None)
    if peer:
        await page.add_init_script(PEER_OPTIONS)
    await page.route('**/three.min.js', lambda r: r.fulfill(path=THREE, content_type='application/javascript'))
    await page.route('**/peerjs.min.js', lambda r: r.fulfill(path=PEERJS, content_type='application/javascript'))

    main_js = open(os.path.join(ROOT, 'js', 'main.js'), encoding='utf-8').read()
    hooked = main_js.replace('  game.start();', '  window.__dbg = game;\n  game.start();')
    assert hooked != main_js, 'could not add the debug hook to js/main.js'
    await page.route('**/js/main.js', lambda r: r.fulfill(body=hooked, content_type='application/javascript'))
    await page.goto(url)
    await page.wait_for_function('window.__dbg !== undefined', timeout=30000)
    return page


async def fast_forward(page, frames, chunk=50):
    """Runs `frames` game updates without drawing, in small chunks so timers and network
    messages still get through between them."""
    await page.evaluate('() => window.__dbg.stop()')
    for _ in range(0, frames, chunk):
        await page.evaluate(f'() => {{ const g = window.__dbg; for (let f = 0; f < {chunk}; f++) g.update(); }}')
        await page.wait_for_timeout(20)
    await page.evaluate('() => window.__dbg.start()')


class Checks:
    """Collects pass/fail lines; `done()` prints a summary and returns the exit code."""

    def __init__(self, name):
        self.name = name
        self.failed = 0

    def ok(self, cond, what, detail=''):
        mark = 'PASS' if cond else 'FAIL'
        if not cond:
            self.failed += 1
        print(f'  {mark}  {what}' + (f'  ({detail})' if detail != '' else ''))
        return cond

    def done(self, errors):
        self.ok(not errors, 'no page errors', '; '.join(errors)[:500])
        print(f'{self.name}: {"OK" if not self.failed else f"{self.failed} FAILED"}')
        return 1 if self.failed else 0


def wait(seconds):
    time.sleep(seconds)
