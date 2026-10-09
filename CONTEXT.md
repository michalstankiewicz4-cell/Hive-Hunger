# Project context

A recovery file: everything needed to pick the project up again — what it is, what was decided and why, how it is built, tested and published. Read this first if you are new to the project (or an assistant resuming work). Keep it up to date when something important changes.

## What it is

**Hive Hunger** — a free 3D browser game: a swarm that behaves like a flock of birds eats a voxel planet. Single player by default; multiplayer (Co-op / PvP, up to 4) over WebRTC.

- Play: https://michalstankiewicz4-cell.github.io/Hive-Hunger/
- Repository: https://github.com/michalstankiewicz4-cell/Hive-Hunger (branch `main`)
- Owner: Michał (michalstankiewicz4-cell), Warsaw. Talks in Polish; the game, code comments and docs are in **English**.
- Current version: see `js/version.js` and `CHANGELOG.md`.

## How the game is meant to behave (decisions so far)

These came from the owner's requests; keep them unless he asks otherwise.

- **3D only** (a 2D version existed early on and was removed on request).
- **Planet:** voxel sphere with Earth-like terrain, clouds, ice caps, atmosphere glow; rock inside (no coloured layered interior — removed on request). Small voxels for a smooth look. Slowly spins.
- **Swarm = flock (boids):** units keep spacing, align, stay together; **every unit has the same constant speed**; turning on screen is smoothed.
- **Eating is deliberate:** a unit claims its own voxel, flies to it, lands and eats; **one voxel is eaten by one unit only** unless there are no more free voxels; **no eating in passing**; **no bouncing and no passing through voxels** (units slide along surfaces).
- **"Eat nearest block"** toggle (test mechanic, on by default): after eating, a unit goes straight to the nearest uneaten voxel; no free flying.
- **Clicks** send the whole swarm to the spot (marker ring shown); the swarm flies around the planet, not through it. Stuck units bite through the blocking voxel.
- **Beacon** at the spawn point (about one planet radius above the surface, on screen, away from the panel): clicking it calls the swarm home.
- **100% means every voxel is gone.** Then the swarm returns home and only then does the next planet appear.
- **Defaults:** units 20, speed 0.05, power 0.5, spacing 1.5, cohesion 1.0, "Eat nearest block" on. "Reset to default" restores them.
- **Start screen:** Single player / Multiplayer · Co-op / Multiplayer · PvP. In single player a **Menu** button pauses and returns to it (no reload).
- **Multiplayer:** host-authoritative WebRTC via PeerJS, room link `?room=CODE`, mode chosen when creating the room, up to 4 players, each with own swarm, colour, beacon, settings. Waiting room: the match begins only when every player has pressed Start; Not ready takes it back. Spawns spread evenly around the planet (2 opposite, 3 at 120°, 4 at 90°), re-spread on join/leave.
- **SEO:** title, description, keywords (including "incremental free"), Open Graph/Twitter thumbnail (`og-image.png`, rendered from the game — not the owner's early screenshot), `VideoGame` JSON-LD, sitemap.

## Working with the owner

- He prefers that new ideas are **proposed, not added on their own** — implement what he asks, list further ideas as suggestions.
- He tests on the live GitHub Pages site.

## Code map

See `docs/ARCHITECTURE.md` (modules, frame loop, swarm, planet) and `docs/MULTIPLAYER.md` (rooms, protocol). Everything tunable is in `js/config.js`.

## Publishing

- GitHub Pages deploys automatically from `main` via `.github/workflows/static.yml` (whole repository is the site).
- History so far was pushed from the owner's Windows machine (`C:\Users\micha\vsrepos\Hive-Hunger`) with his own git credentials, because the Claude GitHub app had no write access to the repository. Commits were prepared in a cloud workspace, transferred as `git bundle` files, fast-forwarded and pushed there.
- Versioning: bump `js/version.js`, add a `CHANGELOG.md` entry, tag the commit `vX.Y.Z`.

## Testing (how it was done)

- Headless Chromium (Playwright) with SwiftShader WebGL; Three.js and PeerJS served from local npm copies (the sandbox could not reach CDNs).
- The game exposes nothing global; test copies add `window.__dbg = game` in `main.js` to drive and inspect it (fast-forward `game.update()` in chunks, read `planet.left`, swarm arrays, scores).
- Multiplayer: a local PeerJS server (`peer` package, `ExpressPeerServer` on `127.0.0.1:9000`, path `/peerjs`) plus `window.HIVE_PEER_OPTIONS` injected before load; two pages = host + guest. On a small test machine, pause rendering on guest pages after they join (`__dbg.stop()`), otherwise 4–5 WebGL pages starve the CPU and the last one can't join.
- Checked: full planet eaten to 0 and new planet; return home; recall; reset; no unit inside solid voxels; no shared bites; host/guest planet and scores identical; late join; guest leaving detected; single player unchanged; start screen; match starts only after every player pressed Start; spawns at 180° / 120° / 90° and re-spread on leave.

## Version history (short)

| Version | Commit | What |
| --- | --- | --- |
| 0.1.0 | `2cd4ab0` | first 3D game on GitHub Pages (+ Pages workflow) |
| 0.2.0 | `debc45c` | English everywhere |
| 0.3.0 | `3cf435d` | SEO, thumbnail, "incremental free" |
| 0.4.0 | `40b12aa` | nearest-block mechanic, click marker, clicks move the whole swarm, unstick, spawn distance, new defaults |
| 0.5.0 | `3e32ecb` | planet spin, beacon/recall, full eating + return home, reset to default |
| 0.5.1 | `3fd82b5` | smoother unit turning |
| 0.6.0 | tag `v0.6.0` | multiplayer (WebRTC, Co-op/PvP, up to 4), docs, versioning |
| 0.7.0 | tag `v0.7.0` | start screen, waiting room with Start, symmetric spawns |
| 0.7.1 | tag `v0.7.1` | Menu button in single player, Not ready in the waiting room |

## Known limitations

- The host's tab must stay in the foreground (browsers pause animation in background tabs → the game pauses for everyone).
- Multiplayer depends on the PeerJS public server for joining; strict NATs without TURN may fail to connect (no TURN server is configured).
- With slow defaults (20 units, speed 0.05) a planet takes a long time; sliders change that live.

## Ideas proposed earlier but not done

Suggested during development; not built because the owner hasn't asked for them.

- Bird- or ship-shaped units instead of sticks.
- Planet types (desert, ice, gas, lava), a separate cloud layer, city lights on the night side.
- Pinch-to-zoom on phones.
- Swarm settings already in the waiting room.
- Points and upgrades for the swarm; sound.
