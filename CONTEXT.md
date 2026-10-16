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
- **Points & upgrades:** 1 voxel = 1 point (counter at the top). Tab opens a pixel-art upgrade tree growing upwards: units, speed, power, chain lightning (+ jumps / voltage / capacitor). Upgrades add to the sliders (sliders stay). No saving — reset on reload; in multiplayer every player has their own. Lightning fires on its own every few seconds and only weakens voxels. Voxels have a destruction animation (on the smooth surface: it sinks in and darkens); they are still one bite for now (harder voxels planned later).
- **Levels:** a cycle of five planets, repeated until more levels are designed — 1 a test board with every box shape from 1×1×1 to 4×4×4 once (20 boxes, no rotated copies — the owner's choice, 5 voxels apart, 350 voxels) to see how the smooth surface treats small shapes; 2 the usual planet; 3 a cube with the edge of the small sphere's diameter; 4 the text TEST LVL in coloured letters; 5 a test board: a sphere and a cube (radius 17) 10 voxels apart.
- **Graphics:** the owner picked the **smooth surface** (slopes instead of steps) for every planet (0.13.0) after trying cubes, smooth and wedges as separate levels. Graphics only — physics and eating stay on voxels. The cube and wedge styles remain in the code. 0.14.0: level 1 tries `smoother` (no terraces) so the owner can judge it in play; points/voxel counts are unchanged by any style. 0.14.1: the owner saw units eating invisible bits in `smoother` — fixed: the blur only shapes slopes, every solid voxel is drawn. 0.14.2: the owner still preferred `smooth` (`smoother` left flat, sharp-edged faces) — every level is `smooth` again. 0.14.3: the `smoother` code removed on request.
- **Planet:** voxel sphere with Earth-like terrain, clouds, ice caps; rock inside (no coloured layered interior — removed on request). Small voxels for a smooth look. Slowly spins.
- **Swarm = flock (boids):** units keep spacing, align, stay together; **every unit has the same constant speed**; turning on screen is smoothed.
- **Eating is deliberate:** a unit claims its own voxel, flies to it, lands and eats; **one voxel is eaten by one unit only** unless there are no more free voxels; **no eating in passing**; **no bouncing and no passing through voxels** (units slide along surfaces).
- **"Eat nearest block"** toggle (test mechanic, on by default): after eating, a unit goes straight to the nearest uneaten voxel; no free flying.
- **Clicks** send the whole swarm to the spot (marker ring shown); the swarm flies around the planet, not through it. Stuck units bite through the blocking voxel.
- **Beacon** at the spawn point (about one planet radius above the surface, on screen, away from the panel): clicking it calls the swarm home.
- **Pieces bitten off drift (0.16.0):** when eating splits a body, every part smaller than the rest comes loose, drifts gently away from the centre and turns; parts of equal size all stay (the owner's choices: "every part smaller than the rest", including big halves; equal parts both stay). Drones can chase and eat them for normal points; the planet counts as eaten only when the pieces are gone too. 0.16.1 (owner's request): a drone that hasn't eaten for 10 s stops for 0.5 s and takes another bite (back to the old one if there is none); pieces stop 4 units from where they came off; big pieces turn slower (edge ≤ half the default drone speed — proposed by the assistant, accepted). 0.17.0: pieces bitten through break up again the same way, down to the last voxel.
- **Ship types (0.18.0):** bottom-right panel, linked sliders Eaters / Lasers (all units together; 1 laser by default). Red laser ships eat from 5 voxels away (glowing beam, 0.18.1) and fly 10% slower; they fire only once they face their bite (owner: not while turning). 0.18.2: eaters too eat only once they face their bite; a **Turning** slider under Power sets how fast ships turn (owner: they turned a bit fast). Lasers can hit a bite through a thin wall (no line-of-sight check).
- **Storm ships (0.19.0):** blue; from laser range, a bolt (the chain-lightning look) forking at 70% into three: bite 40% of a laser's damage (whole crater, Power), two nearest voxels 30% each (owner: "identical damage to the laser, split over 3 blocks", sides slightly weaker). Normal speed. Same retarget rules as every ship (owner). Colours by type for every player: eaters yellow, lasers red, storms blue (owner's choice, also in multiplayer); lightning glow ~2 px. Start: units split as evenly as possible (7/7/6).
- **Tugs (0.20.0, the owner's idea):** green; fly only to drifting pieces; from 10 voxels a tractor beam (green cone of light streaks, brightest at the tug — from a reference picture the owner sent) takes the whole piece and tows it to the player's beacon; there it is gone and the player gets 5× the points of what is left (planet share counts the voxels once). Others may eat it while towed — "the cost, but the value is bigger if it gets there" (owner). Every ship type always has its own slider (owner). Start: even split, 5 of each.
- **Level switch (0.17.0):** single player only, buttons 1–5 in the settings panel; the swarm restarts from its beacon (owner: so it never gets stuck inside a shape). Hidden in multiplayer.
- **100% means every voxel is gone.** Then the swarm returns home and only then does the next planet appear.
- **Defaults:** units 20, speed 0.05, power 0.5, spacing 1.5, cohesion 1.0, "Eat nearest block" on. "Reset to default" restores them.
- **Start screen:** Single player / Multiplayer · Co-op / Multiplayer · PvP. In single player **Esc** pauses and opens it, Esc again carries on (no Menu button — removed on request). No atmosphere glow (removed on request).
- **Fair rooms:** creating a Co-op/PvP room starts from scratch (planet 1, no points/upgrades/eaten voxels from single player); only the settings panel stays.
- **Multiplayer:** host-authoritative WebRTC via PeerJS, room link `?room=CODE`, mode chosen when creating the room, up to 4 players, each with own swarm, colour, beacon, settings. Waiting room: the match begins only when every player has pressed Start; Not ready takes it back. Ping shown next to every player; notices when someone joins, leaves or loses the connection. After each planet a summary (voxels eaten of the planet per player, share, total, PvP winner) closes with **Next planet** — the next planet waits until everyone pressed it. Spawns spread evenly around the planet (2 opposite, 3 at 120°, 4 at 90°), re-spread on join/leave.
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

How an assistant working in a cloud workspace publishes (as done for 0.12.0):

1. Commit and tag in the cloud workspace, then `git bundle create hh.bundle vPREV..main vNEW`.
2. Copy the bundle into the owner's clone folder on his computer (a file transfer to the connected folder).
3. In Windows PowerShell in `C:\Users\micha\vsrepos\Hive-Hunger`: `git fetch hh.bundle main:refs/remotes/bundle/main refs/tags/vNEW:refs/tags/vNEW`, then `git merge --ff-only bundle/main`, delete the bundle, and `git push origin main vNEW`. PowerShell prints git's progress on stderr as a red "NativeCommandError" — that is not a failure; check for `main -> main`.

Older way (0.6.0–0.11.1), only as a fallback: fast-forwarding through the Linux shell linked to his computer (clone mounted at `~/mnt/Hive-Hunger`). That shell **cannot delete files** until the owner allows it (a permission prompt) — without it git leaves `.lock` files (`.git/index.lock`, `.git/objects/maintenance.lock`, `tmp_pack_*`) and can't replace changed files; remove leftover locks only if no git is running. Run git there as `git -c core.autocrlf=true -c core.fileMode=false …` (the clone has CRLF line endings, otherwise every file looks modified). It has no GitHub credentials, so the push still goes from PowerShell.

## Testing

Browser tests live in `tests/` (see `tests/README.md`): `test_solo.py` and `test_multi.py`, Playwright + headless Chromium with SwiftShader WebGL, Three.js / PeerJS from `tests/node_modules` instead of the CDNs, a local PeerJS server, and `window.__dbg = game` added by rewriting `js/main.js` on the fly. `test_levels.py` checks the level cycle and the smooth / wedge surfaces (`SHOTS=<folder>` saves screenshots). `test_tree.py` checks points, buying, bonuses, lightning and the damage animation (`SHOTS=<folder>` saves the tree and a bolt). `test_fragments.py` checks pieces coming loose, drifting and being eaten. Run all five after every change to the game.

Lessons from writing them:

- Fast-forward `game.update()` in chunks (e.g. 50 frames, then yield) — one long synchronous loop starves timers and network messages, so pings time out and players get dropped.
- On a small machine, pause guest pages after they join (`__dbg.stop()`); 4–5 pages rendering WebGL in software starve the CPU and the last one can't join. Paused pages still receive messages.
- Don't select buttons by text (`text=Single player`): the page has a visually hidden description for search engines with the same words. Use classes (`.menu-choice`, `.menu-start`) and keys (Esc, Tab).
- Pass/fail conditions about a new planet must allow for the swarm having started eating it already.

## Pitfalls (bugs that already happened)

- **`started` vs `running`** in `Game3D`: `running` = the render loop is on (`start()` / `stop()`); `started` = the match has begun (start screen / waiting room / Esc pause before or between). A text replacement once put `started = false` into `stop()`, which froze single player in tests.
- **Planet frame:** the simulation (swarms, voxels) never rotates; the camera, sky, sun and beacons turn around the planet by `spin`. Beacon positions are in the space frame (`spawnSpace`), compare them with swarm positions only through `spawnWorld()`.
- **No `hp <= 0` guard in `VoxelPlanet.remove()`**: an early return there once stopped every voxel from being removed (scores went up, the planet never shrank).
- **Ending at 100%:** never shatter the planet early (it used to shatter at 97%); units must be able to land on isolated scraps (`reachDistance`), or the last voxels are circled forever.
- **Claims:** a voxel claimed by a unit must be released whenever the unit drops it (`dropAllBites`, new planet, player leaving), or other units will never eat it.
- **Guests don't simulate.** Anything that changes the game must happen on the host and reach guests through messages (`players`, `planet`, `stats`, `notice`, `summary`, `bolt`, `tree`) or snapshots.

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
| 0.11.0 | tag `v0.11.0` | points, upgrade tree (Tab, pixel art), chain lightning, destruction animation |
| 0.11.1 | tag `v0.11.1` | Atmosphere on/off switch in the settings panel |
| 0.12.0 | tag `v0.12.0` | atmosphere removed, Esc instead of the Menu button, rooms start from scratch |
| 0.12.1 | tag `v0.12.1` | documentation checked against the code and corrected |
| 0.13.0 | tag `v0.13.0` | smooth surface on every planet, 4-level cycle, damage shown on the surface |
| 0.14.0 | tag `v0.14.0` | level 1: sphere + cube test board, extra-smooth style; guests joining large levels fixed |
| 0.14.1 | tag `v0.14.1` | extra-smooth style shows every voxel; seam after eating fixed |
| 0.14.2 | tag `v0.14.2` | level 1 back to the smooth style (owner's choice) |
| 0.14.3 | tag `v0.14.3` | extra-smooth style code removed |
| 0.15.0 | tag `v0.15.0` | level 1: every box shape 1×1×1 … 4×4×4; the sphere + cube board moves to level 5 |
| 0.16.0 | tag `v0.16.0` | pieces bitten off drift and turn; the swarm chases and eats them |
| 0.16.1 | tag `v0.16.1` | drones give up on a bite they can't catch (10 s → 0.5 s pause → another bite); pieces stop 4 units away; big pieces turn slower |
| 0.16.2 | tag `v0.16.2` | version shown next to the title on the start screen |
| 0.17.0 | tag `v0.17.0` | drifting pieces break up again when bitten through; level switch in single player |
| 0.18.0 | tag `v0.18.0` | ship types: eaters and red laser ships (bottom-right panel) |
| 0.18.1 | tag `v0.18.1` | lasers fire only when facing their bite; glowing beam |
| 0.18.2 | tag `v0.18.2` | eaters face their bite before eating too; Turning slider |
| 0.19.0 | tag `v0.19.0` | storm ships (forked lightning); colours by ship type; even split at the start; thin lightning glow |
| 0.20.0 | tag `v0.20.0` | tugs towing drifting pieces home for 5× points; four ship-type sliders |

## Known limitations

- The host's tab must stay in the foreground (browsers pause animation in background tabs → the game pauses for everyone).
- Multiplayer depends on the PeerJS public server for joining; strict NATs without TURN may fail to connect (no TURN server is configured).
- With slow defaults (20 units, speed 0.05) a planet takes a long time; sliders change that live.
- A huge, fast swarm crumbles a planet into thousands of small drifting pieces (each its own small mesh); with 1500 units at full power the frame time roughly doubles while it lasts. Normal swarms add about 1–2 ms per frame.
- **Fast swarms can't finish a planet.** At high Speed a unit turns in a wide arc (radius ≈ `speed / turnRate`, e.g. 0.5 / 0.07 ≈ 7) and can circle an isolated last voxel forever without coming within `reachDistance` + its speed; the planet stays at a few dozen voxels. Found while testing 0.8.0 (3 swarms at speed 0.5); lowering Speed finishes it. Not fixed yet — waiting for the owner's decision.

## The owner's ideas for later (not built yet — wait for him to ask)

- Decided against: drifting pieces bouncing off each other (2026-10-16).

## Ideas proposed earlier but not done

Suggested during development; not built because the owner hasn't asked for them.

- Bird- or ship-shaped units instead of sticks.
- Planet types (desert, ice, gas, lava), a separate cloud layer, city lights on the night side.
- Pinch-to-zoom on phones.
- Swarm settings already in the waiting room.
- Sound.
