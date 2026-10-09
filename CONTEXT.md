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
- **Levels:** a cycle of six planets, repeated until more levels are designed — 1 smaller (radius −30%), 2 the usual, 3 smooth surface, 4 cubes with wedges in the steps, 5 a cube with the edge of planet 1's diameter, 6 the text TEST LVL in coloured letters. Smooth/wedges are **graphics only** (owner's choice); new levels are meant to try new graphics approaches.
- **Planet:** voxel sphere with Earth-like terrain, clouds, ice caps, atmosphere glow; rock inside (no coloured layered interior — removed on request). Small voxels for a smooth look. Slowly spins.
- **Swarm = flock (boids):** units keep spacing, align, stay together; **every unit has the same constant speed**; turning on screen is smoothed.
- **Eating is deliberate:** a unit claims its own voxel, flies to it, lands and eats; **one voxel is eaten by one unit only** unless there are no more free voxels; **no eating in passing**; **no bouncing and no passing through voxels** (units slide along surfaces).
- **"Eat nearest block"** toggle (test mechanic, on by default): after eating, a unit goes straight to the nearest uneaten voxel; no free flying.
- **Clicks** send the whole swarm to the spot (marker ring shown); the swarm flies around the planet, not through it. Stuck units bite through the blocking voxel.
- **Beacon** at the spawn point (about one planet radius above the surface, on screen, away from the panel): clicking it calls the swarm home.
- **100% means every voxel is gone.** Then the swarm returns home and only then does the next planet appear.
- **Defaults:** units 20, speed 0.05, power 0.5, spacing 1.5, cohesion 1.0, "Eat nearest block" on. "Reset to default" restores them.
- **Start screen:** Single player / Multiplayer · Co-op / Multiplayer · PvP. In single player a **Menu** button pauses and returns to it (no reload).
- **Multiplayer:** host-authoritative WebRTC via PeerJS, room link `?room=CODE`, mode chosen when creating the room, up to 4 players, each with own swarm, colour, beacon, settings. Waiting room: the match begins only when every player has pressed Start; Not ready takes it back. Ping shown next to every player; notices when someone joins, leaves or loses the connection. After each planet a summary (points per player, PvP winner) closes with **Next planet** — the next planet waits until everyone pressed it. Spawns spread evenly around the planet (2 opposite, 3 at 120°, 4 at 90°), re-spread on join/leave.
- **SEO:** title, description, keywords (including "incremental free"), Open Graph/Twitter thumbnail (`og-image.png`, rendered from the game — not the owner's early screenshot), `VideoGame` JSON-LD, sitemap.

## Working with the owner

- He prefers that new ideas are **proposed, not added on their own** — implement what he asks, list further ideas as suggestions.
- He tests on the live GitHub Pages site.

## Code map

See `docs/ARCHITECTURE.md` (modules, game states, frame loop, swarm, planet), `docs/MULTIPLAYER.md` (rooms, protocol) and `docs/CONFIG.md` (what the values in `js/config.js` do).

Licence: MIT (`LICENSE`), chosen by the owner.

## Publishing

- GitHub Pages deploys automatically from `main` via `.github/workflows/static.yml` (whole repository is the site).
- Versioning: bump `js/version.js`, add a `CHANGELOG.md` entry, tag the commit `vX.Y.Z`.
- The owner's clone is `C:\Users\micha\vsrepos\Hive-Hunger` (Windows). The Claude GitHub app has no write access to the repository, so pushes go out from his machine with his own git credentials.

How an assistant working in a cloud workspace publishes (as done for 0.6.0–0.8.0):

1. Commit and tag in the cloud workspace, then `git bundle create hh.bundle vPREV..main vNEW`.
2. Move the bundle to the owner's machine (e.g. base64 through the Linux shell that is linked to his computer, where the clone is mounted at `~/mnt/Hive-Hunger`), then `git fetch ../hh.bundle main:refs/remotes/bundle/main 'refs/tags/vNEW:refs/tags/vNEW'` and fast-forward `main`.
3. That Linux shell **cannot delete files** in the folder until the owner allows it (a permission prompt). Without it git leaves `.lock` files behind (`.git/index.lock`, `.git/objects/maintenance.lock`, `tmp_pack_*`) and can't replace changed files. Ask for delete permission first; remove leftover locks only if no git is running.
4. The Windows clone has CRLF line endings. Run git in the Linux shell as `git -c core.autocrlf=true -c core.fileMode=false …`, otherwise every file looks modified (only line endings and file modes differ — not real changes).
5. The Linux shell has **no GitHub credentials**. Push from Windows PowerShell on his machine: `git push origin main vNEW` (PowerShell prints git's progress on stderr as a red "NativeCommandError" — that is not a failure; check for `main -> main`).

## Testing

Browser tests live in `tests/` (see `tests/README.md`): `test_solo.py` and `test_multi.py`, Playwright + headless Chromium with SwiftShader WebGL, Three.js / PeerJS from `tests/node_modules` instead of the CDNs, a local PeerJS server, and `window.__dbg = game` added by rewriting `js/main.js` on the fly. `test_levels.py` checks the level cycle and the smooth / wedge surfaces (`SHOTS=<folder>` saves screenshots). Run all three after every change to the game.

Lessons from writing them:

- Fast-forward `game.update()` in chunks (e.g. 50 frames, then yield) — one long synchronous loop starves timers and network messages, so pings time out and players get dropped.
- On a small machine, pause guest pages after they join (`__dbg.stop()`); 4–5 pages rendering WebGL in software starve the CPU and the last one can't join. Paused pages still receive messages.
- Don't select buttons by text (`text=Single player`): the page has a visually hidden description for search engines with the same words. Use classes (`.menu-choice`, `.menu-start`, `#menu-button`).
- Pass/fail conditions about a new planet must allow for the swarm having started eating it already.

## Pitfalls (bugs that already happened)

- **`started` vs `running`** in `Game3D`: `running` = the render loop is on (`start()` / `stop()`); `started` = the match has begun (start screen / waiting room / Menu pause before or between). A text replacement once put `started = false` into `stop()`, which froze single player in tests.
- **Planet frame:** the simulation (swarms, voxels) never rotates; the camera, sky, sun and beacons turn around the planet by `spin`. Beacon positions are in the space frame (`spawnSpace`), compare them with swarm positions only through `spawnWorld()`.
- **No `hp <= 0` guard in `VoxelPlanet.remove()`**: an early return there once stopped every voxel from being removed (scores went up, the planet never shrank).
- **Ending at 100%:** never shatter the planet early (it used to shatter at 97%); units must be able to land on isolated scraps (`reachDistance`), or the last voxels are circled forever.
- **Claims:** a voxel claimed by a unit must be released whenever the unit drops it (`dropAllBites`, new planet, player leaving), or other units will never eat it.
- **Guests don't simulate.** Anything that changes the game must happen on the host and reach guests through `players` / `stats` / `notice` messages or snapshots.

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
| 0.8.0 | tag `v0.8.0` | planet summary with Next planet, ping and connection stats, joined / left / connection lost notices, tests in `tests/`, MIT licence, more docs |
| 0.9.0 | tag `v0.9.0` | planet levels: smaller planet, smooth surface, wedges |
| 0.10.0 | tag `v0.10.0` | levels 5 (cube) and 6 (TEST LVL text), `shapes.js` |

## Known limitations

- The host's tab must stay in the foreground (browsers pause animation in background tabs → the game pauses for everyone).
- Multiplayer depends on the PeerJS public server for joining; strict NATs without TURN may fail to connect (no TURN server is configured).
- With slow defaults (20 units, speed 0.05) a planet takes a long time; sliders change that live.
- **Fast swarms can't finish a planet.** At high Speed a unit turns in a wide arc (radius ≈ `speed / turnRate`, e.g. 0.5 / 0.07 ≈ 7) and can circle an isolated last voxel forever without coming within `reachDistance`; the planet stays at a few dozen voxels. Found while testing 0.8.0 (3 swarms at speed 0.5); lowering Speed finishes it. Not fixed yet — waiting for the owner's decision.

## Ideas proposed earlier but not done

Suggested during development; not built because the owner hasn't asked for them.

- Bird- or ship-shaped units instead of sticks.
- Planet types (desert, ice, gas, lava), a separate cloud layer, city lights on the night side.
- Pinch-to-zoom on phones.
- Swarm settings already in the waiting room.
- Points and upgrades for the swarm; sound.
