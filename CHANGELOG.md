# Changelog

All notable changes to Hive Hunger. Versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`); while the game is below 1.0, a new minor version may change how things play. The current version is also in `js/version.js` and shown in the bottom-right corner of the game. Each version has a git tag (`v0.6.0`, …).

## [0.56.0] — 2026-10-23

### Added
- **Moving lava and water:** lava churns — a dark crust cracked by glowing orange veins, slowly flowing — and glows; water ripples and glints here and there. On the balls of the test board and on every droplet, each droplet with its own pattern (no two alike). They stand still while the game is paused.

## [0.55.0] — 2026-10-23

### Added
- **Liquids** (the test board, for now): the water and lava balls are liquid. A voxel of them eaten or destroyed floats away as a droplet; there is no gravity — the droplets keep drifting, slow down and gather into floating blobs (lava is thicker: it slows sooner and holds together harder) and bounce off rock. They give no points, and no ordinary ship can collect them.
- **Siphons** — a new support ship (lime): it does nothing but take in droplets of liquid let loose in space, drawing in every droplet within 6 voxels, a point each. On the ship bar, in the Ship guide and the editors (not in the upgrade tree yet).

### Changed
- The test board starts with no ships (buy them on the ship bar).

## [0.54.0] — 2026-10-23

### Changed
- **Test board:** instead of Earth, 4 balls 10 voxels across, one of each kind of voxel from the voxel editor — rock, water, iron, lava (only their colours so far; they are all eaten like rock until their kinds are built). The tunnel and the camera come closer to them.

## [0.53.1] — 2026-10-23

### Fixed
- Sending ships away with Brood bought (its +10 ships on top of yours): once your own ships ran out, a ship sent away stayed in the swarm hidden in the tunnel and showed up as an extra eater that could not be sent away. Now the Brood ships can be sent away too and the swarm always gets smaller by one.

## [0.53.0] — 2026-10-23

### Added
- **Sending ships away:** a **−** on every thumbnail of the ship bar (**Shift**: 10). The ship jumps to hyperspace like at the end of a planet (a streak, gone) and then it is gone from your swarm; no other ship changes its type; at least one ship stays. In multiplayer a guest's − goes through the host.

## [0.52.0] — 2026-10-18

### Added
- **Dev tools** on the start screen: tiles for the ship editor, the tree editor, the new voxel editor (each opens in a new tab) and the test board.
- **Test board:** Earth again and again — once eaten, the ships jump and it is back at once (no map); 2 ships of every type; points count but nothing is saved and the map gets no ticks; its Esc menu has no saving; Exit to main menu puts the ships back as at the start.
- **Voxel editor** (`tools/voxel-editor.html`): plan kinds of voxels — rock (the game today), water, iron, lava and your own: name, colour, glow, see-through, strength, points, which ships eat it, behaviour, where and how much, on which bodies, in your own words. Export / Import, EN / PL. Nothing in the game changes.
- `tests/test_voxel_editor.py`.

## [0.51.0] — 2026-10-17

### Added
- **M** opens the solar system map during a mission in single player: the game pauses, the planet you are on says "Now playing" with **Back to it**. M, Esc, Back or Back to it carry on; Start on another body leaves this mission for it. Nothing is saved — the game saves itself only when a mission is done. Settings → Keyboard lists M.

## [0.50.1] — 2026-10-17

### Changed
- A ship bought on the ship bar comes out of your tunnel like ships arriving on a planet: the tunnel opens, the ship flies out, the tunnel closes (before: it appeared in the middle of the swarm).

## [0.50.0] — 2026-10-17

### Added
- **Neptune** can be played: light blue, 2 × Earth's radius (really 3.9 × — too many voxels for a browser; 2 × is 3.7 million voxels, 8 × Earth's). Missions go Kuiper Belt → Pluto → Charon → Neptune → Triton → Earth.
- On a planet bigger than Earth the tunnels and the camera (its distance and zoom limits) move out with its size.

## [0.49.0] — 2026-10-17

### Added
- **Triton** can be played: like Pluto (grey rock with a slightly cooler tint, polar caps), a little bigger — 0.85 × Earth's radius (really 1.14 × Pluto). Missions go Kuiper Belt → Pluto → Charon → Triton → Earth.

## [0.48.0] — 2026-10-17

### Added
- **Pluto** can be played: 0.75 × Earth's radius, light grey rock, white polar caps. Missions go Kuiper Belt → Pluto → Charon → Earth.

## [0.47.0] — 2026-10-17

### Added
- **Charon** can be played: a moon half the size of Pluto (0.375 × Earth's radius), icy, with rock darker grey than Pluto's. On the map it is no longer "coming soon"; missions go Kuiper Belt → Charon → Earth.
- A mission may have its own look: surface colours, sea level, polar caps, clouds and the inside's rock (`CONFIG.levels[].surface`, `rock`, `rockCore`).

## [0.46.1] — 2026-10-17

### Added
- **Autosave:** when a mission is done the game saves itself, and the map says so ("Kuiper Belt done · game saved"). Before, leaving without saving kept the mission ticked on the map but lost the points and upgrades. Continue then opens the map with the points back.
- **New game** with a saved game asks first: "Delete your saved game and start a new one?" — **Delete it and start a new game** or **No**.

## [0.46.0] — 2026-10-17

### Added
- **Tree editor** (`tools/tree-editor.html`, also on the site under `/tools/tree-editor.html`): a separate page for planning the upgrade tree, starting from the game's tree. Drag a node to move it (level and angle); **Add node** puts a swarm trait, ship or ship property where you click (linked to the selected node); **Connect** links a lower node to a higher one (the same two again removes the link); for every node: name, kind, branch, ship, what should be there in your own words, the text in the game, cost, level, angle, any or all parents (with their links listed), coming soon, a colour from a palette of 16 darker pastel colours made from the ships' colours; the branches' colours from the same palette; notes. Pointing at or selecting a node lights up its links. Kept in the browser; **Export** saves a JSON file with the whole tree and every change (added and removed nodes, changed fields, links added and removed, colours), **Import** loads it back. EN / PL. Nothing in the game changes.
- `tests/test_tree_editor.py`.

## [0.45.1] — 2026-10-17

### Changed
- **Upgrade tree:** all lines are thinner — the links between nodes, the level rings and the nodes' outlines are one pixel now (the tree is drawn at the screen's resolution; icons and level numbers stay pixel art). Links across branches are dashed.
- **Upgrade tree:** pointing at a node lights up its links to the nodes above and below it.
- The game screen no longer shows "Press Space to pause"; Space still pauses single player, and "Paused · press Space to continue" shows while it is paused.

## [0.45.0] — 2026-10-17

### Added
- **Ship bar** along the bottom: a thumbnail of every ship type (attack ships, a line, support ships) with how many you have. Click a thumbnail to choose that group — one at a time, eaters at first, it stays chosen. **+** buys one ship of that type, **Shift** + buys 10 — free for now — up to 100 ships in all; a new ship comes as the last of its type, so no other ship changes its type. In multiplayer a guest's purchases go through the host.
- **Sending groups:** a click on a voxel (the planet, an asteroid or a drifting piece) sends only the chosen group there — their next bites are the voxels nearest to the spot; ships that don't eat (tugs, support, cleaners, boosters) fly there and then carry on as usual; the other groups go on with what they were doing. A click on your tunnel calls only the chosen group home (it stops eating and waits there until sent out again).
- **Ship editor:** an EN / PL switch in the header (remembered in the browser; the exported file stays in English).

### Changed
- Clicks into empty space do nothing (before: the swarm flew to the spot beside the planet).
- You start with **3 eaters** and no other ships (before: 2 of each of the 14 types).
- Settings → Mouse describes the ship bar and sending groups.

### Removed
- The settings panel (Units, Speed, Power, Turning, Reset to default) and the level switch; the Ship types panel with its sliders, arrows and locks (replaced by the ship bar). Speed, Power and Turning keep their starting values (upgrades still add to them).

## [0.44.0] — 2026-10-17

### Added
- **Ship editor** (`tools/ship-editor.html`, also on the game's site under `/tools/ship-editor.html`): a separate page for planning changes to the ships. It reads the game's current values and shows, for the whole swarm and every ship type: the values that change how it plays and how it looks (with the game's value and what each does, changes marked, a reset per value and per ship); what it goes for, in order of priority; its tasks in order (drag or ↑ ↓, on / off, when each applies, a value or note), standard tasks (what the ships in the game do today) and your own, non-standard ones; notes. Kept in the browser; **Export** saves a JSON file with every change (the setting's path, the game's value and the new one; the tasks and priorities next to the game's), **Import** loads it back. Nothing in the game changes until the file is applied to the code.
- `tests/test_editor.py`: the editor's values, tasks, priorities, notes, reload, export, import and reset.

## [0.43.2] — 2026-10-17

### Changed
- **Cutters** keep cutting for 1 s after they get through: the sheet shines on through the cut, far into space (like the piercers' beam), then the cutter flies on.

### Fixed
- On the Kuiper Belt a cutter that got through its rock went on cutting other rocks far away along the same line; now through means through the rock it started on.

## [0.43.1] — 2026-10-16

### Changed
- **Cutters:** the haze in the sheet drifts 3 × slower; both edge rays always glow (drawn as their own lines too); the sheet covers the whole width of what it hits — the same rock of the belt across gaps in it, and drifting pieces too (cut row by row as they drift through the sheet; before, a cutter only ate its bite on a piece).

## [0.43.0] — 2026-10-16

### Added
- **Cutters** (crimson): a fourteenth ship type, an attack ship. A cutter picks its bite like an eater and, from 20 voxels away, locks a flat red sheet on it, as wide as what it hits (the solid voxels in a row across the sheet, at most 12 each side): a red ray along each edge, a glowing haze drifting between them like a flat laser through smoke, and a bright line where it cuts. The whole row is cut at once — each voxel as hard as a piercer bites — and when it is gone the sheet goes deeper along the line, until through; then the cutter flies on. Guests see the same sheets.
- The Ship guide and the upgrade tree (a ship node on level 4, coming soon) have the cutter.
- Every player starts with 2 of each type: 28 units.

### Fixed
- A player leaving a room no longer leaves its boosters' fields behind on the other screens.

## [0.42.2] — 2026-10-16

### Changed
- CONTEXT: the tags v0.32.0 … v0.42.1 are on GitHub now; how the owner adds a tag after each version.

## [0.42.1] — 2026-10-16

### Changed
- Documentation brought up to date: README (intro, Ship guide, rooms), CONTEXT (where the work stopped and what is next, how publishing works now — `main` is pushed from the workspace, tags by the owner — the version table in order), ARCHITECTURE (game states with the map and the pause menu, shapes, voxel counts), CONFIG (the upgrade tree).

## [0.42.0] — 2026-10-16

### Added
- **A new upgrade tree** (Tab), growing upwards over numbered levels 0–5, not symmetrical, with links across branches: every **ship type** as a big hexagon (Eaters, Lasers and Tugs on level 1 … Snipers on level 5), each with its **properties** as small circles (e.g. Lasers: Range, Burn, Light hull; Bombers: Blast radius, Long black hole, Survivor), and the **whole swarm's traits** as diamonds (Brood, Wings, Jaws, Agility, Swarm sense, Chain lightning with Arcs, Voltage, Capacitor). A dotted link: either parent is enough; a solid one across branches: both are needed.
- For now only Brood, Wings, Jaws and the lightning can be bought (they work as before); the ships, their properties, Agility and Swarm sense are shown as *coming soon* — their logic comes later.

### Changed
- Brood and Jaws have 3 steps, Wings 2, Arcs / Voltage / Capacitor one each, in a chain (they had 5 and 3).

## [0.41.1] — 2026-10-16

### Changed
- Single player: the game stands still while the upgrade tree (Tab) is open, and carries on when it closes (unless it was paused before).

## [0.41.0] — 2026-10-16

### Added
- **Save game** in the Esc menu, under Resume: saves and stays paused (it says when it was saved).
- With a saved game, the main menu says under **Single player**: *New game or continue your saved game (its mission)* — before it is pressed.

### Changed
- Search: Polish keywords and a short Polish description of the game (in the text for search engines), so it can be found in Polish searches too; the page stays in English.

## [0.40.0] — 2026-10-16

### Added
- **Esc menu** in single player: **Resume** (or Esc), **Save and exit**, **Exit to main menu** (without saving) and Settings.
- **Saved game** (one, in this browser): the mission under way — its planet with the voxels eaten so far (drifting pieces go back in place) — your points, upgrades, the settings panel and the ship types. The swarm comes out of its tunnel again.
- With a saved game **Single player** asks: **Continue** (shows the mission, points and when it was saved) or **New game** (deletes the save and the map's ticks; no points or upgrades).
- **Settings → Delete save game** (asks once more): deletes the save and the map's ticks.

### Changed
- Search and sharing: a new description and keywords (the solar system, 13 ship types, co-op and PvP), structured data with genres, play modes and 1–4 players, a hidden description for search engines, the sitemap date; the **link preview picture is now the start screen** (`og-image.jpg`, 130 KB instead of a 900 KB PNG).
- Exit to main menu drops that game's points and upgrades (the saved game, if any, stays).

## [0.39.0] — 2026-10-16

### Changed
- **The Kuiper Belt is seen at an angle**: the band is tipped back (its far edge away from you) and, in single player, the camera starts turned a little round, so the band runs off into the distance on one side.
- Starting a mission in single player turns the camera to that mission's starting view.

## [0.38.0] — 2026-10-16

### Changed
- **No internet needed for the libraries**: Three.js r128 and PeerJS 1.5.4 are now in the repository (`js/vendor/`, with their MIT licences) instead of coming from cdnjs and unpkg. Single player works offline from a local server; multiplayer still needs the internet to find the other players.

## [0.37.0] — 2026-10-16

### Removed
- **The camera no longer turns by itself.** The planet's slow spin was shown by turning the camera, sky and tunnels round it, which got in the way; it is off (`planet.spinSpeed` 0 — the code stays). The camera turns only when you turn it.

## [0.36.1] — 2026-10-16

### Changed
- **Ship guide** fits the screen: its window stays put with the title and Back always in view, and only the ships scroll inside it (with a thin scroll bar) when they don't fit.

## [0.36.0] — 2026-10-16

### Changed
- **The Kuiper Belt is a band**, not a ring: as wide as the ring's radius was and five rings long (about 230 × 23 units), very slightly bent along its length, facing the camera — 335 small irregular icy asteroids, none touching another. Zoom out to see all of it.
- **Settings** are no longer one tall column: Mouse, Keyboard and Graphics side by side (one under another on narrow screens).
- A planet's voxel grid may be long and flat instead of a cube (the band needs only about 1.6 million voxels' room instead of 100 million).

## [0.35.0] — 2026-10-16

### Added
- **Start screen picture** (the owner's): a voxel ship cutting into a voxel planet, full screen behind the start screen, the Ship guide and Settings opened from it. The title HIVE HUNGER glows orange above the menu, on the right where the sky is (on phones: the menu at the bottom).
- **Loader**: shown at once while the start picture, the 3D engine, multiplayer and the game load — the title, a progress bar and what is loading, over a blurred picture; it fades out when everything is in.

## [0.34.0] — 2026-10-16

### Added
- **Solar system map**: single player and multiplayer start from a 3D map of the solar system, scaled for the game — the Sun, the orbits, the planets with their moons and two belts of asteroids, seen from above at an angle; drag to turn, wheel or two fingers to zoom. The missions go from the outside in: the Kuiper Belt, Pluto and Charon, Neptune and Triton, Uranus, Saturn and Titan, Jupiter, Europa and Io, the Asteroid Belt, Mars, Deimos and Phobos, Earth and the Moon, Venus, Mercury, the Sun.
- A click on a body opens its **card**: a small picture, what it is, the task and **Start** — or *Coming soon* for the bodies that can't be played yet. The next mission is marked; finished ones get a tick (single player, remembered in this browser).
- **Kuiper Belt** — the first mission: a tilted ring of 70 small irregular icy asteroids, none touching another.
- Single player: when a mission's planet is eaten and the ships are gone, you are back on the map with the next mission marked. Every mission that can be played is open from the start.
- Multiplayer: the missions go in order (the Kuiper Belt, then Earth, then round again); the map shows where the room is going behind the waiting room and the summary. The summary names the body and the next mission.
- The HUD shows the body's name instead of the planet number.

### Removed
- The test boards (boxes, cube, the TEST LVL text, sphere + cube) are no longer levels; Earth (the usual planet) stays as a mission. Their shapes are still in the code (the tests build them).

### Changed
- The level switch has a button per playable mission (1 the Kuiper Belt, 2 Earth).

## [0.33.0] — 2026-10-16

### Added
- **Boosters** (pink): a thirteenth ship type, a support ship. A booster doesn't eat — it flies with the swarm in a gentle force field 5 voxels across, a ball of shimmering octagonal cells in pinks. Your own ships inside a field get +20% Power: a 20% wider crater and eating 20% harder (eaters, lasers, storms, piercers; drills drill 20% wider). Several fields at once don't add up. Guests see the same fields.
- The Ship guide has the booster with its picture (ships lighting up as they fly through the field).
- Every player starts with 2 of each type: 26 units.

## [0.32.0] — 2026-10-16

### Added
- **Splashers** (blue): a twelfth ship type, an attack ship. From 10 voxels away a splasher fires a bubble of liquid 3 voxels across — irregular and wobbling, and inside it the view behind is bent like through a lens (a drop of water). One bubble at a time. Where it lands, a block of 3 × 3 voxels across the surface and 2 deep soaks for 3 seconds — weakening — and is then destroyed (points for every voxel). On a drifting piece only that piece's voxels soak. Guests see the same bubbles.
- The Ship guide has the splasher with its picture (a wobbling bubble, then the soaking block).
- Every player starts with 2 of each type: 24 units.

## [0.31.1] — 2026-10-16

### Changed
- **Piercers go right through the planet**: the line is followed all the way to the far side of the whole planet (before: 70 units), and once through, for the 2 more seconds the beam goes out of the hole and on into space (its spiral up to 90 units).
- **Snipers keep their distance**: between shots they no longer fly in towards their bite — they move with the swarm at their own height and never closer to the planet, and fire from there.

## [0.31.0] — 2026-10-16

### Added
- **Snipers** (teal): an eleventh ship type. From any distance a sniper stops, charges for 5 seconds facing its bite and fires a thin shot (a little smaller than an eater) that speeds up 5% for every voxel it flies. In front of it a rounded glowing cap like a meteor entering an atmosphere, a short wake behind, a flash at the hit; the shot always destroys the voxel it hits (a point). Then the sniper flies on for a second, stops and charges again. Guests see the same shots.
- **Ship guide** on the start screen: every ship type with a small picture and what it does — attack ships and support ships apart, all on one screen; pointing at a ship (or focusing it) plays its shot. Esc or Back returns.
- Every player starts with 2 of each type: 22 units.

### Changed
- The Ship types panel lists the types in the Ship guide's order: attack ships, then — below a line — support ships (Tugs, Support, Cleaners).
- Piercers hit everything on their line, voxels other ships have claimed too, so they keep firing until really through (3 at a time, then 2 s more).

## [0.30.0] — 2026-10-16

### Changed
- **Piercers fire right through**: once aimed at a bite, a piercer locks the line from itself through it and fires along it — always at the 3 nearest voxels on the line, each at 0.8 × an eater's rate — until no voxel is left on it (up to 70 units, so through a whole planet), then 2 seconds more; then it switches off and goes on to its next bite. It stays put meanwhile. On a drifting piece it still just eats its bite.

### Fixed
- A ship eating a voxel on a drifting piece is no longer carried into the planet when the piece drifts against it.

## [0.29.0] — 2026-10-16

### Added
- **Piercers** (copper): a tenth ship type. From up to 20 voxels away a piercer fires an orange laser with a yellow lightning winding loosely round it in a spiral (about one turn per 1.5 units; drawn like the support ships' bolt, 4-px glow). The beam goes through 3 voxels in a row — the bite and the two behind it along the beam — and eats them all at once, each at 0.8 × an eater's rate (a point each). Guests see the same beams and spirals.
- The Ship types panel has a tenth slider, **Piercers**. Every player starts with 2 of each type: 20 units.

### Changed
- A drilling drill also clears the voxel it is in, so its now narrower tunnel never leaves it inside the rock.

## [0.28.0] — 2026-10-16

### Added
- **Settings** in the menu (a button on the start screen, in the waiting room and on the room panel during a match):
  - **Mouse** — what the mouse and touch do, **Camera turning** and **Zoom speed** sliders;
  - **Keyboard** — the keys (Tab, Space, Esc);
  - **Graphics** — **FPS counter** (bottom right), **Resolution** (50%, 75%, 100%, native), **Smooth edges** (antialiasing, applied at once with a new renderer), **Effects** (Low / Medium / High: how much debris and how many orb sparks).
  - Everything applies at once and is remembered in the browser; **Reset settings** restores the defaults; Back or Esc returns.

### Changed
- **The camera turns any way round**: no vertical limit any more, it goes over the poles (it turns around its own axes).
- The game screen no longer describes the controls (they are in Settings); the HUD line only says what is happening (jumping to hyperspace, called back, connecting). "Tab: upgrades" is gone from the points counter.
- **Drills are half as strong**: what goes around the bit is 0.75 × your Power — 0.375 at the default Power (about 0.75 voxels, was 1.5) — and grows with the Power slider.
- **The subspace tunnel** is 10° narrower while it opens (then widens back to its usual shape) and opens out at the end like the bell of a trumpet; it has half the light streaks (35), bunched unevenly, and their last 20% fade out to transparent.

### Fixed
- Support ships no longer fire lightning while they (or the ships it would jump to) are still in the tunnel or gone to hyperspace.

## [0.27.0] — 2026-10-16

### Added
- **Drills** (orange): a ninth ship type. A drill flies to the nearest voxel, turns its nose towards the planet's centre (a little off it, at random) and drills a straight tunnel in at 0.08 units per frame: everything within 1.5 voxels of the bit is gone, a point each. It stops once it is through (empty space for a moment after the last voxel) or has drilled 60 units, then picks its next bite. While drilling, an orange spiral bit turns at its nose. On a drifting piece it eats like an eater. Guests see the same drills and bits.
- The Ship types panel has a ninth slider, **Drills**.

### Changed
- Every player starts with **2 ships of every type** — 18 units (`START_EACH` in `config.js`).
- **Space** pauses single player: nothing moves (the camera still turns), "Paused · press Space to continue" at the bottom; Space again carries on. "Press Space to pause" is shown there while playing (not on touch screens).

## [0.26.0] — 2026-10-16

### Added
- **Cleaners** (grey): an eighth ship type. They eat only drifting pieces of 1, 2 or 3 voxels — the nearest first, never the planet or a bigger piece; with no such piece about they fly with the swarm. Guests see them grey too.
- **Arrows** on both sides of every Ship types slider: one ship less / more per click.
- The Ship types panel has an eighth slider, **Cleaners**. At the start the 20 units are split as evenly as possible: 3 eaters, lasers, storms and tugs, 2 bombers, orb ships, support ships and cleaners.

### Changed
- **At most 100 units** in a swarm: the Units slider goes from 10 to 100, and upgrades can't take it past 100.
- When a bomber blows up, the ships after it keep their types (an orb or support ship could change type before).
- Ship types are one list in the code (`SHIP_KINDS` in `config.js`): settings, the panel, colours and the swarm's order all follow it.

### Fixed
- Ships added while the swarm was jumping to hyperspace (a higher Units slider, an upgrade) stayed behind, and the next planet came only after 25 s. Now they jump too.

## [0.25.2] — 2026-10-16

No change to how the game plays or looks.

### Changed
- `Player` split into `Player.js` (setting up, commands, settings, the frame step), `arrival.js` (the tunnel, hyperspace), `ships.js` (tugs, bombers, orb and support ships) and `upgrades.js` (points, the tree, chain lightning).
- `VoxelPlanet` split into `VoxelPlanet.js` (the grid, what is solid), `look.js` (materials, colours, drawn cubes), `eating.js` (bites, claims, removing voxels), `search.js` (finding food, raycasts), `runs.js` (eaten voxels for late joiners) and `grid.js` (shared constants, also used by `Fragments.js`).

### Fixed
- A test of storm ships could fail now and then when the bite had no free voxels next to it.

## [0.25.1] — 2026-10-16

No change to how the game plays or looks.

### Changed
- **Code split into folders:** `js/three/` now has `game/`, `swarm/`, `planet/`, `effects/` and `scene/`. `Game3D` is split into `Game3D.js` (setup, players, planets, frame loop), `input.js`, `destruction.js`, `host.js`, `guest.js`, `hud.js`; `Swarm3D` into `Swarm3D.js` (flock, feeding, collisions, drawing), `types.js`, `remote.js`, `warp.js`, `beams.js`, `tows.js` and `steering.js`. The parts add their methods to the class, so everything is called as before.
- **Styles split by part of the page:** `css/style.css` became `base`, `hud`, `panel`, `lobby`, `menu`, `summary`, `points` and `tree`.
- **Faster smooth surface:** rebuilding it is about 25–35% faster (flat corner and edge tables, no per-voxel colour arrays), so eaten craters show sooner. The output is exactly the same.
- One shared texture for all hyperspace streaks and one for all tractor beams instead of one each; the glow textures come from one helper (`js/three/textures.js`).
- Hidden cubes under the smooth surface are no longer updated when a voxel is damaged; the tunnel, tugs and orbs reuse their scratch vectors every frame.

### Removed
- Unused code: `Swarm3D.isLaser`, `VoxelPlanet.eatenFraction`, the `support.fadeIn` setting.

## [0.25.0] — 2026-10-16

### Added
- **Subspace tunnel** at the spawn point instead of the beacon: a blue vortex of light streaks swirling around a bright white-blue core, facing the planet. When the ships arrive (the start of a planet, a level switch) it opens, the ships fly out of it one after another, and once they are all out it closes to a small, dim swirl. Click it to call the swarm back (it glows brighter meanwhile). When a tug brings a piece home the tunnel opens for a moment and takes the piece in.
- **Escape into hyperspace**: when the planet is eaten the ships no longer fly home — each jumps to hyperspace at a random moment within 2.5 s (with many ships several at once): it speeds up away from the planet, leaving a blue streak with lighter lines along it (like a tractor beam, but not the same), and is gone. The next planet appears once every ship has left. Guests see the same jumps.

### Removed
- The amber beacon (`SpawnBeacon.js`) and the return home after a planet.

## [0.24.0] — 2026-10-16

### Added
- **Support ships** (white): a seventh ship type that doesn't eat. Every 3 s each fires a lightning bolt that jumps between ships of its own swarm — the next one picked at random among those within 10 units, up to 6 jumps, none twice — running from ship to ship over 1.5 s and gone once it reaches the last one. Every voxel on its way is destroyed as it passes (a point each; drifting pieces too). The bolt is white with a 4-pixel glow and energy flowing along it, not straight but irregularly bent, with small branches (2-pixel glow) that do nothing. It follows the ships as they fly. Guests see the same bolt (same ships, same random seed).
- The Ship types panel has a seventh slider, **Support**. At the start: 3 of each type, 2 support ships.

### Fixed
- Orbs, lightning bolts and black holes from the previous planet are cleared when a new planet appears (they could destroy voxels of the new one); an orb ship whose orb was cleared can fire again.

## [0.23.0] — 2026-10-16

### Added
- **Orb ships** (magenta): a sixth ship type. From 10 voxels away an orb ship fires a voxel-sized plasma orb with a pulsing glow and a fiery tail (sparks from white-yellow to orange to dark red) — one at a time, the next only after it has burst. The orb flies slowly to the bite (following it on a drifting piece) and bursts with a flash: everything within 2 voxels is gone, a point each. Guests see the same orbs.
- The Ship types panel has a sixth slider, **Orbs**. At the start the 20 units are split as evenly as possible: 4 eaters, 4 lasers, 3 storms, 3 tugs, 3 bombers, 3 orb ships.

## [0.22.0] — 2026-10-16

### Added
- **Bombers** (purple): a fifth ship type. A bomber flies to the nearest voxel and, touching it, blows up every voxel within 10 voxels (5 units) — in the planet and on drifting pieces, claimed or not — a point each; the bomber is gone for good: the Units and Bombers settings go down by one.
- **Black holes**: each blast leaves a black hole for 4 s (1 s growing, 2 s at full size, 1 s shrinking). It bends the picture around it (gravitational lensing: a black disc with a thin bright ring, what is behind it seen around it) and gently pulls in debris and drifting pieces within 15 voxels; debris falling in is gone, a piece falling in is swallowed — its voxels count as eaten, a point each for the bomber's owner. Guests see the same holes.
- **Locks** in the Ship types panel: a checkbox in front of every slider locks it — it can't be moved, and moving another slider never changes it.
- At the start the units are split evenly between the five types: 4 of each.

### Changed
- The settings panel follows values the game changes (Units after bombers blew up). The Units slider snaps to its step of 10; the number next to it is exact.

## [0.21.1] — 2026-10-16

### Changed
- The tractor beam follows the towed piece's shape: it fans out from the tug to the piece's outline as seen from the tug (the convex hull of its outer voxels), only 5% larger than the piece, instead of a round cone around it. Its light streaks end inside that outline.

## [0.21.0] — 2026-10-16

### Changed
- **Eating the nearest block is always on**: every unit eats the nearest free voxel to itself and flies straight to it.

### Removed
- The other eating mode (bites picked near the swarm target, with flocking while feeding), its "Eat nearest block" toggle, and the **Spacing** and **Cohesion** sliders. Units keep the default spacing and cohesion from `config.js`.

### Fixed
- A ship that lands on a new bite always turns to it before eating, even right after eating a previous one (a laser could flash its beam for one frame first).

## [0.20.0] — 2026-10-16

### Added
- **Tugs** (green): a fourth ship type that doesn't eat. A tug takes the nearest drifting piece nobody tows yet and flies to it; within 10 voxels of it a green tractor beam (a glowing cone of light streaks, brightest at the tug) takes in the whole piece, and the tug flies home with the piece following (around the planet, not through it). At the beacon the piece is gone and the player gets 5 × the points of what is left of it (the voxels count as eaten; in PvP the planet share counts them once). Other ships may eat the piece while it is towed. If the tug falls too far behind, the beam lets go and it catches up again.
- The Ship types panel has a fourth slider, **Tugs**. At the start the units are split evenly: 5 eaters, 5 lasers, 5 storms, 5 tugs.
- Multiplayer: the snapshot carries each player's tugs and tractor beams; piece positions are sent 10 times a second while one is towed.

## [0.19.0] — 2026-10-16

### Added
- **Storm ships** (blue): a third ship type. From laser range (5 voxels) it fires lightning straight at its bite; at 70% of the way the bolt forks into three — the bite gets 40% of the damage a laser would do (its whole crater, Power included), the two voxels nearest to it 30% each, with slightly weaker bolts. When the bite is gone, it picks the next one by the same rules as every other ship. It flies at the normal speed.
- The Ship types panel has a third slider, **Storms**. Lasers and Storms take their ships from the eaters; Eaters take theirs from the storm ships first, then from the lasers.

### Changed
- Ship colours by type, the same for every player: eaters yellow, laser ships red, storm ships blue (in multiplayer, players are told apart by their beacons and the scoreboard).
- At the start the units are split as evenly as possible between the three types: 7 eaters, 7 lasers, 6 storms.
- Lightning (storm ships and chain lightning) has only a thin glow now — about 2 pixels on each side of its white core, the same on screen at any distance.

## [0.18.2] — 2026-10-16

### Changed
- Eaters (blue ships) also turn to face their bite before they start eating it, like laser ships (within `swarm.aimAngle`, 12°).

### Added
- **Turning** slider under Power: how fast ships turn their nose (0.02–0.3, default 0.12; lower = slower). Since ships eat only once they face their bite, slower turning also means a short wait before each bite.

## [0.18.1] — 2026-10-16

### Changed
- A laser ship fires only once it has turned to face its bite (within 12°), not while it is still turning.
- A nicer laser: a glowing band with a white-hot core fading to red, turned towards the camera, shimmering slightly, with a soft glow where it hits.
- The ships' drawn heading is now turned in the simulation (laser ships aim with it); guests still smooth it while drawing.

## [0.18.0] — 2026-10-16

### Added
- **Ship types.** A new panel in the bottom-right corner splits your units into **Eaters** and red **Lasers** with two linked sliders (together they are always all your units, upgrades included). By default 1 ship is a laser. A laser ship stops 5 voxels (2.5 units) from its bite and eats it from there with a red beam; it flies 10% slower. Points are the same. In multiplayer every player has their own split; guests see the red ships and their beams (the snapshot now carries the number of laser ships and the beams being fired).

## [0.17.0] — 2026-10-16

### Added
- **Pieces break up again.** When a drifting piece is bitten through, the smaller part comes loose from it as a new piece (equal parts both stay) — and so on, until everything is eaten. A new piece starts where it was in its parent, moving and turning with it, with a small push away from it; it can drift up to 4 units from there. In multiplayer the guests get the new pieces from the host (the FRAG message now also carries where a piece came off).
- **Level switch** in the settings panel (single player only): buttons 1–5 build that level right away, and the swarm starts again from its beacon, so it can't end up inside the new shape.

## [0.16.2] — 2026-10-16

### Added
- The game version is shown next to the title on the start screen (it was only in the bottom-right corner), so it's easy to check the page is the latest one.

## [0.16.1] — 2026-10-16

### Changed
- **A drone that can't catch its bite gives up on it.** If a drone with a bite hasn't eaten anything for 10 s, it stops for 0.5 s (the bite may come closer meanwhile), then takes another free bite; if there is no other, it goes back to the one it had (`swarm.retarget`).
- **Drifting pieces stay close:** a piece stops at most 4 units from where it came off and only keeps turning (`fragments.maxDistance`).
- **Big pieces turn slower:** a piece's edge never moves faster than 0.025 per frame — half the default drone speed — so drones can keep up with it (`fragments.maxRimSpeed`).

## [0.16.0] — 2026-10-16

### Added
- **Pieces bitten off drift away.** When eating cuts a body of voxels into parts, every part smaller than the rest comes loose and gently drifts away from the planet's centre while slowly turning (drawn with the same smooth surface). Parts of equal size all stay. Bodies that were apart from the start — the boxes, the letters, the sphere and the cube — are never compared with each other.
- The swarm can chase drifting pieces, land on them and eat them like any other voxel — same points; units don't fly through them. Coming loose is not eating: the planet counts as eaten only when the pieces are gone too.
- Multiplayer: the host finds the splits and sends each new piece to the guests (binary `FRAG` message), with position corrections twice a second; a guest who joins mid-planet gets the pieces drifting at that moment.
- `fragments` settings in `config.js` (drift, damping, spin, flood-fill limit, sync interval) and a new test, `tests/test_fragments.py`.

## [0.15.0] — 2026-10-16

### Added
- **Level 1 is a box test board**: every box shape from 1×1×1 to 4×4×4 voxels once — 20 boxes, no rotated copies (each as width ≥ height ≥ depth), 5 voxels apart, one row per depth, each in its own colour (350 voxels). It shows how the smooth surface handles the smallest shapes.

### Changed
- The sphere + cube board moves from level 1 to the end of the cycle (level 5). The cycle now has five levels.

## [0.14.3] — 2026-10-16

### Removed
- The unused extra-smooth style (`smoother`) and its code. The smooth surface is back to exactly the 0.13.0 version, plus the sphere shading on the sphere + cube board.

## [0.14.2] — 2026-10-16

### Changed
- Level 1 (the sphere + cube board) is back to the smooth style used everywhere else — the owner's choice after trying the extra-smooth one (it left flat, sharp-edged faces). The extra-smooth style stays in the code, unused.

## [0.14.1] — 2026-10-16

### Fixed
- Extra-smooth style (level 1): small bits — single voxels, thin edges — disappeared from view while the swarm could still eat them. The averaging now only shapes the slopes; whether there is a surface follows each voxel, so everything edible is drawn and nothing eaten stays drawn.
- Extra-smooth style: a thin dark seam could appear next to fresh craters (a neighbouring piece of the surface wasn't rebuilt).

## [0.14.0] — 2026-10-16

### Added
- **Level 1 is a test board**: a sphere and a cube side by side, 10 voxels apart (each the size of the old small planet), drawn in a new **extra-smooth** style (`smoother`): the surface is built over voxels averaged with their neighbours, so the faint terraces disappear. Graphics only — every voxel is still there and still 1 point (479 400 voxels on this board).

### Fixed
- **Guests couldn't join on large levels** (the text, the new board): the whole-grid bitset sent to a joining guest was larger than WebRTC allows in one message. The planet message now carries only the eaten voxels as run lengths, and any binary message over 60 KB is sent in pieces.

## [0.13.0] — 2026-10-15

### Changed
- **Every planet is smooth** (the owner's choice after the graphics test levels): slopes instead of steps, rounded corners and craters — on the spheres, the cube and the TEST LVL text. Graphics only; the swarm still eats voxels.
- The level cycle is now 4 planets: smaller sphere, usual sphere, cube, TEST LVL text. The separate graphics test levels (smooth, wedges) are gone; the wedge and cube styles stay in the code.
- The destruction animation works on the smooth surface: a voxel being eaten or weakened by lightning sinks into the surface and darkens before it breaks apart.
- Letters S and V reshaped so the smooth surface doesn't split them into pieces.
- The surface is rebuilt within a time budget per frame (3 ms) and faster.

## [0.12.1] — 2026-10-15

### Changed
- Documentation checked against the code and corrected: test list, run times and setup; co-op scoreboard wording; `docs/CONFIG.md` gets the missing values (`background`, planet strength/rock/light, leader steering), corrected `maxCount`, `reachDistance` and `color`, and sections for upgrade costs, the lightning's base values and constants outside `config.js`; voxel counts per level; what guests send; publishing steps in `CONTEXT.md` (push straight from Windows PowerShell). Three outdated code comments fixed. No change to the game.

## [0.12.0] — 2026-10-09

### Changed
- **Rooms start from scratch.** Creating a Co-op or PvP room after playing single player used to carry the single-player game over (the half-eaten planet, points, upgrades, swarm) — unfair to the others. Now a room always starts with a fresh planet 1 and no points or upgrades; only the settings panel values stay.
- **Esc** opens the start screen in single player (the game pauses) and closes it again (the game carries on); it also closes the upgrade tree. The Menu button is gone.

### Removed
- The atmosphere glow around the planet (and its on/off switch).

## [0.11.1] — 2026-10-09

### Added
- **Atmosphere** switch in the settings panel (top right): turns the glow around the planet off or on. Graphics only, on your screen; stays as set for the next planets; "Reset to default" turns it back on.

## [0.11.0] — 2026-10-09

### Added
- **Points** counter at the top: 1 eaten voxel = 1 point (click it or press Tab to open the tree).
- **Upgrade tree** (Tab), drawn as pixel art, growing upwards from the Hive core: **Brood** (+10 units each), **Wings** (+10% speed each), **Jaws** (+0.2 bite radius each) and **Chain lightning** with its own branches **Arcs** (+2 jumps), **Voltage** (+15% strength drained) and **Capacitor** (1 s more often). Upgrades are added on top of the settings panel; points and upgrades last until the page is reloaded. In multiplayer every player has their own points and tree (bought through the host).
- **Chain lightning**: every few seconds a bolt jumps from a random drone to the nearest drones it hasn't hit and weakens every voxel it passes through (never destroying it by itself). Guests see the bolts.
- **Destruction animation**: a voxel being eaten or weakened shrinks, darkens and shakes as its strength runs out, then breaks into debris (ready for harder voxels later).
- `tests/test_tree.py`.

## [0.10.0] — 2026-10-09

### Added
- Level 5: a **cube** with the edge of planet 1's diameter (33.6 — the small sphere would just fit inside), with terrain on its faces.
- Level 6: the text **TEST LVL** made of voxels, every letter in its own colour.
- `js/three/shapes.js` — shapes of a level (`sphere`, `cube`, `text`); new shapes are added there and used as `shape` in `CONFIG.levels`. The cycle now has six levels.

### Changed
- Only spheres get the atmosphere glow and the smoothed day/night shading; the cube and the text keep flat faces.
- Small fix: the planet grid is centred exactly on the origin (planet 1 was off by 0.2).

## [0.9.0] — 2026-10-09

### Added
- **Planet levels** in a cycle of four (then it starts again): planet 1 — a smaller planet (radius 30% smaller), planet 2 — the usual planet, planet 3 — a **smooth surface** (steps become slopes, corners round off), planet 4 — **wedges**: cubes with low-poly ramps and inner/outer corner pieces in the steps. Levels 3 and 4 change only the graphics; the swarm still collides with and eats the voxels.
- `CONFIG.levels` (size and look of each level) and `js/three/PlanetSurface.js` (the surfaces, rebuilt in chunks as voxels are eaten); new looks can be tried out as new levels.
- `tests/test_levels.py`.

## [0.8.0] — 2026-10-09

### Added
- Multiplayer **summary** after each planet: voxels each player ate of it, their share, totals, planets won and the PvP winner. It closes with **Next planet**; the next planet appears once every player has pressed it and the swarms are home.
- Multiplayer connection stats: every player's **ping** next to their name in the scoreboard and in the waiting room; the room panel shows your connection (a guest's ping and data from the host, the host's upload).
- Notices in the HUD: "… joined", "… left the room" (they said goodbye) and "…: connection lost" (dropped or silent for 10 s). Guests see "The host left the room" or "Lost the connection to the host".
- Browser tests in `tests/` (single player and multiplayer with a local PeerJS server).
- MIT licence; `docs/CONFIG.md` (what every setting does); troubleshooting in the README; game-state diagram in `docs/ARCHITECTURE.md`; publishing steps and known pitfalls in `CONTEXT.md`.

### Changed
- The single-player hint in the HUD mentions the **Menu** button.

## [0.7.1] — 2026-10-09

### Added
- **Menu** button in single player (bottom left): pauses the game and goes back to the start screen without reloading; **Single player** carries on with the same game.
- In the waiting room, **Not ready** takes back a pressed Start.

## [0.7.0] — 2026-10-09

### Added
- Start screen: **Single player**, **Multiplayer · Co-op** or **Multiplayer · PvP**.
- Multiplayer waiting room: the room link, the players and who is ready. The match begins only when every player in the room has pressed **Start**; until then the swarms wait at their beacons and the planet stands still. Someone who joins a match that has already begun plays straight away.

### Changed
- Players' spawn points are spread evenly around the planet: 2 players opposite each other, 3 a third of a turn apart, 4 a quarter. When someone joins or leaves, the spawns are spread again.
- During a match the room panel (bottom left) shows the room, its link and Leave; leaving returns to the start screen.

## [0.6.0] — 2026-10-09

### Added
- **Multiplayer over WebRTC** (PeerJS), up to 4 players. The host creates a room — **Co-op** (eat the planet together) or **PvP** (whoever eats more of the planet wins it) — and shares a link (`?room=CODE`). Single player stays the default.
- Every player has their own swarm, colour (Blue, Pink, Green, Violet), beacon and settings panel; all swarms share the planet's voxel claims, so a voxel is still eaten by one unit only.
- Scoreboard in the HUD: voxels eaten per player; in PvP also planets won and a "… wins planet N" banner.
- Multiplayer panel (bottom left): mode, create room, copy link, leave.
- Version number in the corner of the game, `CHANGELOG.md`, `CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/MULTIPLAYER.md`.

### Changed
- The game is split into `Player` (one swarm with its brain, beacon, settings and score) and `Game3D` (planet, camera, roles: solo / host / guest).
- The planet takes a seed, so every browser can build the same planet.

## [0.5.1] — 2026-10-09

### Changed
- Units turn smoothly on screen: the drawn heading follows the flying direction gradually (`swarm.turnSmoothing`); movement and collisions are unchanged.

## [0.5.0] — 2026-10-09

### Added
- The planet slowly spins (the camera, sky, sun and beacon turn around it).
- Amber beacon at the spawn point: clicking it calls the swarm back home.
- "Reset to default" button in the settings panel.

### Changed
- A planet counts as eaten only when its last voxel is gone (it used to shatter at 97%). The swarm then flies home and the next planet appears once it has gathered.
- Units land on a bite once within reach, so isolated scraps at the end are eaten instead of being circled forever.

## [0.4.0] — 2026-10-09

### Added
- "Eat nearest block" mechanic (checkbox): after eating, each unit flies straight to the nearest uneaten, unclaimed voxel.
- Pulsing ring marker where the player clicked.

### Changed
- Clicks send the whole swarm to the clicked spot; units fly around the planet instead of into it and climb out of their pits first.
- Stuck units bite through the blocking voxel (if it is not someone else's) or turn to slide out.
- The swarm spawns about one planet radius away from the surface, on screen.
- Default settings: 20 units, speed 0.05, power 0.5, spacing 1.5, cohesion 1, "Eat nearest block" on.

## [0.3.0] — 2026-10-09

### Added
- Search engine optimisation: title, description, keywords (including "incremental free"), canonical URL, Open Graph / Twitter link previews with a thumbnail, `VideoGame` structured data, favicons, sitemap.

## [0.2.0] — 2026-10-09

### Changed
- Everything in English: UI, code comments, configuration and documentation.

## [0.1.0] — 2026-10-09

### Added
- First release on GitHub Pages: a 3D swarm (boids, constant speed) that eats a voxel planet; deliberate feeding with one claimed voxel per unit; live sliders for units, speed, power, spacing and cohesion; space background with nebulae and stars; GitHub Pages deployment workflow.

[0.15.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.14.3...v0.15.0
[0.14.3]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.14.2...v0.14.3
[0.14.2]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.14.1...v0.14.2
[0.14.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.12.1...v0.13.0
[0.12.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/releases/tag/v0.1.0
