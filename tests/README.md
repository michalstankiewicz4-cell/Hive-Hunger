# Browser tests

Five end-to-end tests drive the real game in headless Chromium (Playwright, WebGL in software via SwiftShader):

- `test_solo.py` — start screen with the version; the Ship guide (12 ships, attack and support apart, on one screen, the shot plays when pointed at) and the Ship types panel in its order; Settings (Mouse, Keyboard, Graphics: FPS counter, resolution, effects and smooth edges apply at once, remembered, Reset settings, Esc back); no controls text on the game screen; the camera turns over the pole; the settings panel (Units, Speed, Power, Turning); ship types at the start (2 of each), linked sliders, the arrows (one ship), locks, colours by type; a storm ship hits its bite (40%) and the two nearest voxels (30% each) with a bolt forked in three; a bomber blows up everything within 10 voxels and is gone (one unit fewer, shown in the panel), its black hole lasts 4 s; an orb ship fires one slow orb at a time (pulsing glow, fiery tail) that destroys everything within 2 voxels; a drill drills straight in with a turning spiral bit and stops once through; a piercer fires from a distance through 3 voxels at once with an orange beam and a spiral lightning, along a locked line until through, then 2 s more, and goes on; a sniper fires from far away after charging 5 s, its shot speeds up 5% per voxel and destroys the voxel hit; a splasher fires a bubble of liquid 3 voxels across (a lens), where it lands a 3 × 3 × 2 block soaks and weakens, gone after 3 s; Space pauses single player and carries on; a support ship's bolt jumps between its own ships, destroys what lies on its way, has branches and is gone after 1.5 s; the level switch (level 3 right away, the swarm back at its tunnel and not inside the planet, eating it); lasers and eaters (lasers eat from a distance with a beam and fly 10% slower, and neither lasers nor eaters eat while turning towards their bite; a slower Turning slider makes them take longer); nothing moves before a mode is chosen; Single player; **Esc** pauses and resumes; no Menu button or atmosphere; a big, fast swarm eats the whole planet to the last voxel with no unit inside solid voxels and no shared bites; the ships jump to hyperspace one after another (random moments, several at once, blue streaks) and are gone; the next planet appears, its tunnel opens, the ships come out of it and it closes.
- `test_levels.py` — the level cycle: shapes and sizes of planets 1–5, all smooth (planet 1: all 20 box shapes from 1×1×1 to 4×4×4 once, full, 5 voxels apart, each in its own colour; planet 5: a sphere and a full cube, every voxel counted; the cube is full, the text has 7 letters in 7 colours and can be eaten), the smooth surface being built and rebuilt after eating (`SHOTS=<folder>` saves a screenshot of every level).
- `test_tree.py` — points (1 voxel = 1 point, shown at the top), the Tab view (pixel art), buying (parent first, enough points, once), bonuses on top of the sliders, chain lightning firing on its own and weakening voxels without destroying them, the destruction animation (a damaged voxel sinks into the smooth surface and darkens).
- `test_fragments.py` — pieces coming loose: a slab cut off a cube comes loose as one piece without counting as eaten, drifts, turns and is drawn smooth; its voxels move with it and are eaten for points; eating in two separate boxes frees neither; a 4×4×4 box cut into 32 + 16 frees the 16; a 3×3×3 box cut into two equal halves keeps both; a piece cut through loses its smaller part as a new piece, which drifts on its own and breaks up again when cut; big pieces turn slowly enough (edge ≤ `maxRimSpeed`) and stop within `maxDistance`; a drone without a bite eaten for 10 s stops for 0.5 s and takes another; the swarm eats the pieces too and only then is the planet finished; tugs catch a piece with a tractor beam and tow it home for 5 × its points; a black hole pulls in a piece gently and swallows it; grey cleaners eat a piece of 3 voxels but not one of 4 or the planet (`SHOTS=<folder>` saves a screenshot).
- `test_multi.py` — with a local PeerJS server: the host plays single player first, then its room starts from scratch (only the settings panel stays); PvP room, two guests; spawns 120° apart and the same on every page; **Start / Not ready**; the match starts only when everyone is ready; host and guests have the same planet and eaten voxels; pings measured and shown; "Pink left the room" after a goodbye; "Green: connection lost" after a dropped connection; spawns spread again (180°); a guest buys upgrades through the host and gets its tree and points back; other guests see its lightning; the PvP summary (winner, shares, planets won) on every page and the next planet only after everyone pressed Next planet; a piece bitten off on the host drifts on the guests and voxels eaten off it disappear there too; a piece bitten through breaks up the same way on the guests; no level switch in multiplayer; guests see every player's ships in the type colours and the black holes of bombers; joining a running match (the late guest gets the eaten voxels and the drifting pieces); "The host left the room".

## Setup (once)

```bash
pip install playwright
python -m playwright install chromium
cd tests && npm install && cd ..
```

`npm install` brings local copies of Three.js r128 and PeerJS 1.5.4 (the tests don't depend on the CDNs) and the `peer` and `express` packages for the local signalling server.

## Running

From the repository root:

```bash
python tests/test_solo.py     # ~30 s – 1 min
python tests/test_multi.py    # ~2–3 min
python tests/test_levels.py   # ~20–30 s
python tests/test_tree.py     # ~20–30 s
python tests/test_fragments.py  # ~30 s
```

Each prints PASS / FAIL lines and exits with 1 if anything failed.

## How it works

- `harness.py` serves the repository on a free local port, loads Three.js / PeerJS from `tests/node_modules`, and rewrites `js/main.js` on the fly to add `window.__dbg = game` (the game itself exposes nothing global).
- `peer-server.js` is a PeerJS signalling server on `127.0.0.1:9000` (`PEER_PORT` to change); pages get `window.HIVE_PEER_OPTIONS` pointing to it.
- Time is fast-forwarded with `game.update()` in chunks of 50 frames, so timers and network messages still run in between.
- Guest pages are paused after joining (`__dbg.stop()`): several pages rendering WebGL in software can starve a small machine. Paused pages still receive messages.
- Buttons are selected by class (`.menu-choice`, `.menu-start`), not by text — the page has hidden text for search engines with the same words.
