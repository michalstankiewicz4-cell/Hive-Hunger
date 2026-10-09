# Browser tests

Two end-to-end tests drive the real game in headless Chromium (Playwright, WebGL in software via SwiftShader):

- `test_solo.py` — start screen; nothing moves before a mode is chosen; Single player; **Esc** pauses and resumes; no Menu button or atmosphere; a big, fast swarm eats the whole planet to the last voxel with no unit inside solid voxels and no shared bites; the swarm returns home and the next planet appears.
- `test_levels.py` — the level cycle: shapes, sizes and styles of planets 1–7 (the cube is full, the text has 7 letters in 7 colours and can be eaten), the smooth and wedge surfaces being built and rebuilt after eating (`SHOTS=<folder>` saves a screenshot of every level).
- `test_tree.py` — points (1 voxel = 1 point, shown at the top), the Tab view (pixel art), buying (parent first, enough points, once), bonuses on top of the sliders, chain lightning firing on its own and weakening voxels without destroying them, the destruction animation.
- `test_multi.py` — with a local PeerJS server: the host plays single player first, then its room starts from scratch (only the settings panel stays); PvP room, two guests; spawns 120° apart and the same on every page; **Start / Not ready**; the match starts only when everyone is ready; host and guests have the same planet and eaten voxels; pings measured and shown; "Pink left the room" after a goodbye; "Green: connection lost" after a dropped connection; spawns spread again (180°); joining a running match; "The host left the room".

## Setup (once)

```bash
pip install playwright
python -m playwright install chromium
cd tests && npm install && cd ..
```

`npm install` brings local copies of Three.js r128 and PeerJS 1.5.4 (the tests don't depend on the CDNs) and the `peer` server package.

## Running

From the repository root:

```bash
python tests/test_solo.py     # ~2–4 min
python tests/test_multi.py    # ~2–3 min
python tests/test_levels.py   # ~1 min
python tests/test_tree.py     # ~1 min
```

Each prints PASS / FAIL lines and exits with 1 if anything failed.

## How it works

- `harness.py` serves the repository on a free local port, loads Three.js / PeerJS from `tests/node_modules`, and rewrites `js/main.js` on the fly to add `window.__dbg = game` (the game itself exposes nothing global).
- `peer-server.js` is a PeerJS signalling server on `127.0.0.1:9000` (`PEER_PORT` to change); pages get `window.HIVE_PEER_OPTIONS` pointing to it.
- Time is fast-forwarded with `game.update()` in chunks of 50 frames, so timers and network messages still run in between.
- Guest pages are paused after joining (`__dbg.stop()`): several pages rendering WebGL in software can starve a small machine. Paused pages still receive messages.
- Buttons are selected by class (`.menu-choice`, `.menu-start`), not by text — the page has hidden text for search engines with the same words.
