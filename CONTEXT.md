# Project context

A recovery file: everything needed to pick the project up again — what it is, what was decided and why, how it is built, tested and published. Read this first if you are new to the project (or an assistant resuming work). Keep it up to date when something important changes.

## What it is

**Hive Hunger** — a free 3D browser game: a swarm that behaves like a flock of birds eats voxel planets. Single player goes through missions on a solar system map (the bodies with a level in `CONFIG.levels` can be played — see docs/CONFIG.md, Levels) with a saved game; multiplayer (Co-op / PvP, up to 4) over WebRTC, the missions in order. 14 ship types, an upgrade tree, a start screen with the owner's picture.

- Play: https://michalstankiewicz4-cell.github.io/Hive-Hunger/
- Repository: https://github.com/michalstankiewicz4-cell/Hive-Hunger (branch `main`)
- Owner: Michał (michalstankiewicz4-cell), Warsaw. Talks in Polish; the game, code comments and docs are in **English**.
- Current version: see `js/version.js` and `CHANGELOG.md`.

## Where we left off (2026-10-17, 0.45.0)

- Live version: see `js/version.js`; everything is pushed to `main`, and the owner added the tags up to v0.42.1 himself (2026-10-16). For every later version give him the tag command (see Publishing).
- **Waiting for:** the owner's files exported from the ship editor and the tree editor (see below) — apply the ship values; talk the tree over with him before building it.
- **Later, for the release (owner):** the ship bar's thumbnails should appear only once that ship type is unlocked in the upgrade tree.
- **Next, when the owner asks:** the upgrade tree's logic. The new layout is in `js/core/SkillTree.js` (ships = hexagons, their properties = circles, the swarm's traits = diamonds, levels 0–5, links across branches); only Brood, Wings, Jaws and the lightning work, everything else is `soon`. Open questions for him: (1) what buying a ship does — unlock the type (but every player now starts with 2 of each), +2 ships, or only open its properties; (2) the list of properties; (3) the cross links. A drawn proposal was shown to him (same layout as the game's tree).
- Other open things: the rest of the solar system's bodies are on the map as "coming soon" (only the bodies in `CONFIG.levels` have levels); unlocking missions in order is chosen but switched off for now (every playable mission is open); the "fast swarms can't finish a planet" limitation (see Known limitations).
- How to work: answer in Polish, write game / code / docs in English; propose ideas, don't add them on your own; ask with a few options when a request leaves real choices; run all seven test suites before every publish; keep README, CHANGELOG, this file, `docs/*` and `tests/README.md` up to date; one publish = one version bump.

## The ship editor (0.44.0, owner)

The owner asked for a separate HTML page with the ships' settings (Power and others) where he can type values or choose actions, priorities, the order of tasks, standard and non-standard actions; **he exports a file and gives it to the assistant to apply the changes**. It is `tools/ship-editor.html` (served on the site too). It imports `js/config.js`, `js/version.js` and `SHIP_INFO` from `js/ui/ShipGuide.js`, so its defaults are always the game's. Assistant's choices: sections = Whole swarm, Eaters (the swarm's eating keys), every ship type (`CONFIG.swarm[kind]`, `warp` under Whole swarm); values split into Play and Look; the tasks and targets "as in the game" are written in the editor (`DEFAULT_TASKS`, `DEFAULT_TARGETS`, standard tasks `ACTIONS`, conditions `WHEN`) — **keep them in step when a ship's behaviour changes**; state in localStorage `hive-hunger-ship-editor`.

**Applying an exported file** (`hive-hunger-ships-<date>.json`): `changes[]` lists every value with `path` in `CONFIG` (e.g. `swarm.cutter.reach`), `from` (the game's value when exported — check it still matches) and `to`. `ships.<kind>` has `tasks` (with `tasksInGame` to compare), `targets` (with `targetsInGame`), `notes`. Values go into `js/config.js` (and the tests / docs that state them); changed tasks, targets and notes describe new behaviour — propose how to build it and ask before changing the game's logic. `raw` is the editor's own state (for Import).

## The tree editor (0.46.0, owner)

The owner asked for a separate page with the upgrade tree to edit: add a node on a level, connect nodes with a line, in a node choose a ship or write in words what should be there, the cost too; other settings such as colours, from a ready palette of 16 ("the ships' colours, only darker pastel, I think"); he exports a file and we talk it over. It is `tools/tree-editor.html`: it imports `NODES` / `BRANCHES` from `js/core/SkillTree.js`, `CONFIG` and `SHIP_INFO`, so it starts from the game's tree. Assistant's choices: the view laid out like the game (rings 0–5, angle), drag to move (level in tenths), Add node at the nearest half level linked to the selected node, Connect = parent first, then child (again = remove), a node's `all` as "Needs any / all parents", node colour overrides the branch's, the palette = the 14 ships' colours + Brood green + lightning violet made softer and darker (`pastel()`), EN / PL like the ship editor, state in localStorage `hive-hunger-tree-editor`.

**An exported file** (`hive-hunger-tree-<date>.json`): `changes` — `added` / `removed` node ids, `changed` ({id, field, from, to}; fields name, kind, branch, ship, wish = the owner's own words, text, cost, depth, angle, all, soon, color), `linksAdded` / `linksRemoved` ([parent, child]), `branchColors`; `nodes` — the whole tree with each node's `status`; `branchColors`, `palette`, `notes`; `raw` (for Import). Talk it over with the owner before changing `SkillTree.js`.

## How the game is meant to behave (decisions so far)

These came from the owner's requests; keep them unless he asks otherwise.

- **Ship bar and groups (0.45.0, owner):** ships can be sent only to voxels (planets, asteroids, drifting pieces) or the tunnel — clicks into space do nothing. Thumbnails of the ships along the bottom choose a group; the count next to each; buying is a + on the thumbnail, free for now. The settings panel (Units, Speed, Power, Turning, Reset) and the level switch are gone; the ship-type sliders too. Start: 3 eaters, nothing else. Owner's choices: one group at a time (no "all"), the choice stays after a click, ships that don't eat fly to the spot and then carry on as usual, + buys 1 and Shift + 10. Assistant's choices: eaters chosen at first, the tunnel calls only the chosen group home, tugs sent somewhere let go of their piece, a sent group carries on once one of its ships got there (`groupArrive`, then `leader.dwellFrames`), the bar's look (the Ship guide's pictures, small), a new ship inserted as the last of its type (no ship changes type), at most 100 ships. The swarm's leader now only wanders on its own (clicks no longer move it). **Later (release):** thumbnails appear only once the type is unlocked in the tree.
- **Ship editor language (0.45.0, owner):** an EN / PL switch in the editor.
- **Tree lines (0.45.1, owner):** "everything is thick and overlaps" — the links, the level rings and the node outlines thinner; pointing at a node lights up its links. Assistant's choice: the canvas at the screen's resolution with 1-pixel lines (the icons and digits stay pixel art), cross links dashed, lit links 2 px with a glow.

- **3D only** (a 2D version existed early on and was removed on request).
- **Points & upgrades:** 1 voxel = 1 point (counter at the top). Tab opens a pixel-art upgrade tree growing upwards (single player stands still meanwhile, 0.41.1, owner): units, speed, power, chain lightning (+ jumps / voltage / capacitor). Upgrades add to the sliders (sliders stay). Saved only by Save and exit (0.40.0; before: reset on reload); in multiplayer every player has their own. Lightning fires on its own every few seconds and only weakens voxels. Voxels have a destruction animation (on the smooth surface: it sinks in and darkens); they are still one bite for now (harder voxels planned later).
- **Ship guide window (0.36.1, owner):** it must fit the screen; the window and the title "Ship guide" stay put and so does Back — only the content scrolls, with a scroll bar.
- **Settings layout (0.36.0, owner):** "too tall" — split horizontally into three parts: mouse, keyboard, graphics (stacked on narrow screens: assistant's choice).
- **Start screen (0.35.0, owner):** the owner's picture (a voxel ship's beam cutting into a voxel planet) as the start screen, a title and the menu over it, a loader if the graphics need loading. Assistant's choices: the menu on the right over the sky (bottom on phones), a darker gradient behind it, the orange glowing title, the picture also behind the Ship guide and Settings opened from the start; the loader counts the picture, the 3D library, PeerJS and the game, over a 48 × 32 blurred copy of the picture inlined in the page; the picture saved as JPEG (280 KB instead of a 2.7 MB PNG).
- **Levels (0.34.0, owner):** the game starts from a solar system map; missions go from the outer belt of small asteroids, through Pluto, the bodies and moons, in to the Sun, scaled for the game, not real. A click on a body: a picture with the task's description and Start. Owner's choices: the full set of bodies with moons (20), unlocking in order chosen but **all playable missions open for now**, the task is to eat the whole body, after a mission back to the map, a 3D map seen from above at an angle; in multiplayer the missions go in order too; **the test boards removed, Earth kept**; only the Kuiper Belt and Earth built for now, the rest on the map as "coming soon". Assistant's choices: the bodies' order (each planet before its moons, outer moon first), map distances and sizes, descriptions, the Kuiper Belt level (rocks of 2–6 voxels, two or three balls each, icy greys; 0.36.0, owner: "not a ring — a band as wide as the ring's radius, very slightly bent, five rings long": 0.95 × 9.5 × the radius, 335 rocks for the same density, its middle 6% of its length nearer the camera than its ends, facing the starting camera; the grid became NX × NY × NZ for it), the HUD showing the body's name; multiplayer: the map behind the waiting room and summary without Start (the waiting room's Start and Next planet start the missions); progress (ticks) kept in localStorage for single player.
- **Old levels (until 0.33.0):** a cycle of five — boxes test board, the usual planet, a cube, the TEST LVL text, a sphere + cube board. Their shapes remain in `shapes.js` (the fragment tests build the cube and the boxes).
- **Graphics:** the owner picked the **smooth surface** (slopes instead of steps) for every planet (0.13.0) after trying cubes, smooth and wedges as separate levels. Graphics only — physics and eating stay on voxels. The cube and wedge styles remain in the code. 0.14.0: level 1 tries `smoother` (no terraces) so the owner can judge it in play; points/voxel counts are unchanged by any style. 0.14.1: the owner saw units eating invisible bits in `smoother` — fixed: the blur only shapes slopes, every solid voxel is drawn. 0.14.2: the owner still preferred `smooth` (`smoother` left flat, sharp-edged faces) — every level is `smooth` again. 0.14.3: the `smoother` code removed on request.
- **Planet:** voxel sphere with Earth-like terrain, clouds, ice caps; rock inside (no coloured layered interior — removed on request). Small voxels for a smooth look. No spin since 0.37.0 (owner: the camera turning by itself got in the way; it spun slowly before).
- **Swarm = flock (boids):** units keep spacing, align, stay together; **every unit has the same constant speed**; turning on screen is smoothed.
- **Eating is deliberate:** a unit claims its own voxel, flies to it, lands and eats; **one voxel is eaten by one unit only** unless there are no more free voxels; **no eating in passing**; **no bouncing and no passing through voxels** (units slide along surfaces).
- **Eating the nearest block is the only mechanic (0.21.0, owner):** after eating, a unit goes straight to the nearest uneaten voxel; no free flying. The old mode (bites near the swarm target with flocking) and its toggle and the Spacing / Cohesion sliders were removed on request.
- **Clicks** send the whole swarm to the spot (marker ring shown); the swarm flies around the planet, not through it. Stuck units bite through the blocking voxel.
- **Spawn tunnel** (0.25.0, replaced the beacon) at the spawn point (about one planet radius above the surface, on screen, away from the panel): clicking it calls the swarm home.
- **Pieces bitten off drift (0.16.0):** when eating splits a body, every part smaller than the rest comes loose, drifts gently away from the centre and turns; parts of equal size all stay (the owner's choices: "every part smaller than the rest", including big halves; equal parts both stay). Drones can chase and eat them for normal points; the planet counts as eaten only when the pieces are gone too. 0.16.1 (owner's request): a drone that hasn't eaten for 10 s stops for 0.5 s and takes another bite (back to the old one if there is none); pieces stop 4 units from where they came off; big pieces turn slower (edge ≤ half the default drone speed — proposed by the assistant, accepted). 0.17.0: pieces bitten through break up again the same way, down to the last voxel.
- **Ship types (0.18.0; the panel replaced by the ship bar in 0.45.0):** bottom-right panel, linked sliders Eaters / Lasers (all units together; 1 laser by default). Red laser ships eat from 5 voxels away (glowing beam, 0.18.1) and fly 10% slower; they fire only once they face their bite (owner: not while turning). 0.18.2: eaters too eat only once they face their bite; a **Turning** slider under Power sets how fast ships turn (owner: they turned a bit fast). Lasers can hit a bite through a thin wall (no line-of-sight check).
- **Storm ships (0.19.0):** blue; from laser range, a bolt (the chain-lightning look) forking at 70% into three: bite 40% of a laser's damage (whole crater, Power), two nearest voxels 30% each (owner: "identical damage to the laser, split over 3 blocks", sides slightly weaker). Normal speed. Same retarget rules as every ship (owner). Colours by type for every player: eaters yellow, lasers red, storms blue (owner's choice, also in multiplayer); lightning glow ~2 px. Start: units split as evenly as possible (7/7/6).
- **Tugs (0.20.0, the owner's idea):** green; fly only to drifting pieces; from 10 voxels a tractor beam (green cone of light streaks, brightest at the tug — from a reference picture the owner sent) takes the whole piece and tows it to the player's beacon; there it is gone and the player gets 5× the points of what is left (planet share counts the voxels once). Others may eat it while towed — "the cost, but the value is bigger if it gets there" (owner). Every ship type always has its own slider (owner). Start: even split, 5 of each.
- **Bombers (0.22.0, owner):** purple; touching a voxel they destroy everything within 10 voxels (points) and die for good (Units −1; owner's choice). A black hole for ~4 s (1 s grow, 2 s hold, 1 s shrink) with lensing; it pulls debris and drifting pieces within 15 voxels, gently (owner), and swallows them (pieces' voxels count for the bomber's owner). Every ship-type slider has a lock checkbox (owner). Start: 4 of each of five types.
- **Orb ships (0.23.0, owner):** magenta; from 10 voxels fire a voxel-sized orb with a pulsing glow (+ a fiery tail, owner) that flies slowly to the target and destroys everything within 2 voxels. One orb at a time per ship (assistant's choice). Normal speed. Start: 4/4/3/3/3/3.
- **Support ships (0.24.0, owner):** white; a lightning bolt jumping randomly between own ships, destroying the voxels on its way, gone after the last ship; white core with a 4 px glow, flowing energy, irregularly bent, small branches with a 2 px glow; 1.5 s. Assistant's choices: every 3 s, up to 6 jumps within 10 units, voxels destroyed as the bolt passes each jump.
- **Tunnel and hyperspace (0.25.0, owner, from two reference pictures — a blue wormhole and blue hyperspace streaks):** the spawn point is a subspace tunnel that opens, lets the ships out and closes; after closing a small swirl stays (owner's choice), clickable for recall, and it opens briefly to take in a towed piece. When everything is eaten the ships escape into hyperspace one after another at random moments, several at once when there are many, each leaving a tail "like a tractor beam but not the same" (owner). Assistant's choices: jumps within 2.5 s, a blue band with lighter streak lines; ships come out over 1.5 s.
- **Boosters (0.33.0, owner):** a support ship with "a gentle force field (a 3D octagonal barrier in shades of pink)"; whoever is in range gets 20% Power; 5 voxels across. Owner chose: a ball of octagonal cells, no stacking, only own ships, it flies with the swarm and doesn't eat; +20% Power = both the crater radius and how hard ships eat (radius alone changes nothing at the default Power — voxels are whole). Assistant's choices: the name Boosters, the pink hull, the cube-sphere pattern of 3 × 3 octagons per side with small squares between, shimmer and rim glow, slow turning; boosted: eaters, lasers, storms (damage), piercers (damage), drills (radius).
- **Splashers (0.32.0, owner):** a ship firing "liquid that looks like an irregular bubble of water 3 voxels across (with a lens effect inside)"; where it hits, a 3 × 3 × 2 area takes damage over 3 seconds and is destroyed. Assistant's choices: the name Splashers, blue, range 10 voxels (as orbs), one bubble in flight per ship, bubble speed 0.07, the 3 × 3 block lies across the surface (the two axes other than the hit voxel's main outward axis) and goes 2 deep inward; bubbles behind the planet are not drawn in the lens pass.
- **0.31.1 (owner):** piercers must really go through the planet; the 2 s after are the beam "passing through the planet and flying on to infinity". Snipers "needlessly fly to the planet" — between shots they now move with the swarm at their own height, never inward.
- **Snipers (0.31.0, owner):** a shot "looking a bit like a line (a little smaller than an eater)", in front of it a meteor-like rounded bow (not a jet's sharp shock), speeding up 5% per voxel, always destroying the voxel hit; any distance; after a shot 1 s moving, then stop and charge — owner first said 1 s, then 5 s of charging. Colour free (teal chosen).
- **Ship guide (0.31.0, owner):** in the start menu, a picture and description per ship; the owner added: the shot animates when pointed at, everything on one screen, attack and support apart; the Ship types panel uses the same order with a line before the support ships (owner).
- **Piercers fire right through (0.30.0, owner):** "when it targets something it drills to the end, and once through, after 2 seconds it switches off and goes on" (the owner chose piercers, not drills). Assistant's choices: the line is locked through the bite, the 3 nearest voxels on it are hit (0.31.0: claimed ones too, so they really go through — owner: "they stop only once fully through + 2 s"), up to 70 units; the next bite may be in range, then it fires again from the same place.
- **Piercers (0.29.0, owner):** a "drilling ship" that fires from 20 voxels an orange laser with a yellow spiral lightning round it (the support ships' bolt style), "a bit less power than an eater but goes through 3 and destroys them at once". Assistant's choices: name Piercers, copper hull, 0.8 × an eater's rate per voxel, voxels in a row along the beam (claimed ones passed over), only the bite on a drifting piece.
- **Settings (0.28.0, owner):** in the menu — Mouse and Keyboard as separate sections (owner), the controls described there instead of on the game screen (owner: "remove the description from the game screen"), camera turning and zoom speed sliders; Graphics: FPS counter, resolution, smooth edges, amount of effects (owner picked all four from the assistant's list). "Tab: upgrades" removed from the points counter. Remembered in the browser (assistant's choice). Also from the room panel in multiplayer and from the waiting room.
- **Free camera (0.28.0, owner):** no vertical limit — it turns over the poles.
- **Drills weaker (0.28.0, owner: "half the drilling power, smaller power"):** what goes around the bit is 0.75 × Power (0.375 at default, half of the old 0.75) and follows the Power slider.
- **Tunnel shape (0.28.0, owner):** 10° narrower only while opening (owner's correction; widens back once open), opening out like the bell of a trumpet, half the streaks (35) bunched unevenly, their last 20% fading to transparent (owner).
- **Start (0.27.0, owner):** every player starts with 2 ships of every type (28 units with the fourteen types of 0.43.0).
- **Drills (0.27.0, owner, from the assistant's list of proposals):** orange, "with a nice spiral orange drill bit". Assistant's choices: they drill straight towards the planet's centre (±`spread`), until through or 60 units; on pieces they eat like eaters. (Width: see 0.28.0.)
- **Space pause (0.27.0, owner):** single player only, "Press Space to pause" at the bottom (removed in 0.45.1, owner: only "Paused" shows while paused); the camera still turns while paused (assistant's choice).
- **Cleaners (0.26.0, owner):** grey; eat only drifting pieces of 1, 2 or 3 voxels (owner's limit; the assistant had proposed a ship for the last isolated voxels). Assistant's choices: nearest small piece first, otherwise they fly with the swarm; normal speed and bite. Same release: **at most 100 units** (owner; the Units slider and upgrades together), **arrows** next to the ship-type sliders (one ship per click, owner).
- **Level switch (0.17.0; removed in 0.45.0, owner):** single player only, a button per playable mission in the settings panel (1–5 before 0.34.0); the swarm restarts from its beacon (owner: so it never gets stuck inside a shape). Hidden in multiplayer.
- **100% means every voxel is gone.** Then the ships jump to hyperspace and only then does the next planet appear (0.25.0; before that they flew home).
- **Defaults:** units 28 (2 of each type), speed 0.05, power 0.5, turning 0.12. "Reset to default" restores them.
- **Start screen:** Single player / Multiplayer · Co-op / Multiplayer · PvP. In single player **Esc** pauses and opens it, Esc again carries on (no Menu button — removed on request). No atmosphere glow (removed on request).
- **Fair rooms:** creating a Co-op/PvP room starts from scratch (the first mission, no points/upgrades/eaten voxels from single player); only the settings panel stays.
- **Multiplayer:** host-authoritative WebRTC via PeerJS, room link `?room=CODE`, mode chosen when creating the room, up to 4 players, each with own swarm, colour, beacon, settings. Waiting room: the match begins only when every player has pressed Start; Not ready takes it back. Ping shown next to every player; notices when someone joins, leaves or loses the connection. After each planet a summary (voxels eaten of the planet per player, share, total, PvP winner) closes with **Next planet** — the next planet waits until everyone pressed it. Spawns spread evenly around the planet (2 opposite, 3 at 120°, 4 at 90°), re-spread on join/leave.
- **SEO:** in English; 0.41.0 (owner): Polish keywords and a Polish paragraph in the hidden text too. Title, description, keywords (including "incremental free"; 0.40.0: solar system, 14 ship types, co-op/PvP), Open Graph/Twitter thumbnail (0.40.0, owner: the start screen — `og-image.jpg`, rendered from the page at 1200 × 630 without the version; before: a picture of the game), `VideoGame` JSON-LD, sitemap.

- **Cutters (0.43.0, owner):** target like an eater, from 20 voxels, a flat red beam covering the target's width — a red ray on each side, an animated haze between them (a flat beam shining through smoke); it simply cuts what it hits, as strong as a piercer. Owner chose: the width of the target, the whole row at once getting deeper until through, crimson hull. Assistant's choices: at most 12 voxels each side of the line (on Earth the "target" is the whole planet), the sheet spreads along the surface (across the line and the way out from the centre), a narrow apex at the ship, a bright line along the cut, 1 s more after getting through, the sheet going on into space (0.43.2, owner; before: none; on a belt only the rock it started on counts) (0.43.1, owner: haze 3 × slower, both edges must glow, cover the whole piece — rows now go over gaps within the same rock, drifting pieces are cut by the sheet's slab), the tree node on level 4 (from Burn or Fourth fork, no properties yet).
- **Upgrade tree (0.42.0, owner):** keep our tree's look and its growth upwards; like the owner's example — not symmetrical, unexpected links; ships with properties to upgrade and traits of the whole swarm; costs don't matter yet; ships on different levels; levels numbered (5 + the start); bigger ship nodes of another shape, the swarm's and the properties' of their own. The assistant proposed the layout (owner: "send it to GitHub under Tab, the logic later"). Open questions for later: what buying a ship does (unlock the type / +2 ships / only open its properties), the list of properties, the cross links.
- **"New or continue" note (0.41.0, owner):** under Single player in the main menu when a save exists, so the player knows before pressing.
- **Save game (0.41.0, owner):** under Resume in the Esc menu; it stays paused and the note says "Saved ✓" with the time (assistant's choice).
- **M opens the map (0.51.0, owner):** in single player during a mission, the planet-choice screen with M, no autosave (autosave only when a mission is done), M pauses the game. Assistant's choices: the current planet's card says "Now playing" with "Back to it"; M, Esc or Back close it and carry on; Start on another body leaves the current mission (its progress is not kept); multiplayer has no M (its missions go in order).
- **Bought ships come out of the tunnel (0.50.1, owner):** like ships arriving: the tunnel opens, the ship flies out. Assistant's choices: no random wait (out as soon as the tunnel is open), during an arrival they come out with the others, none while jumping to hyperspace.
- **Bodies of the outer solar system (0.47.0–, owner, in this order, one publish each):** Charon — half of Pluto, "an icy guy + rocks, darker grey than Pluto"; Pluto — 0.75 × Earth's radius (a correction: first 1.5), polar caps, light grey rock; Triton — like Pluto, size estimated; Neptune — size estimated, light blue. Pluto = 0.75, so Charon = 0.375. Assistant's choices: Triton 0.85 (really 1353 km to Pluto's 1188 km: × 1.14), a cooler grey than Pluto; Neptune 2 × Earth (really 3.9 × — that would be about 27 million voxels; 2 × is 3.7 million, built in about a second), light blue in soft patches; on planets bigger than Earth the tunnels and the camera move out by R / Earth's R (`fitToPlanet`); the colours (palette per level), ice below `seaLevel` and rock above it on Charon.
- **Autosave and New game question (0.46.1, owner):** finishing a mission and leaving without saving left the map ticked but the points gone — now a mission done saves the game by itself, with a note on the map ("Kuiper Belt done · game saved"); New game with a save asks "Delete your saved game and start a new one?" (Delete it and start a new game / No). Assistant's choices: the note's wording and place (over the map), No goes back to the start screen.
- **Saving (0.40.0, owner):** Esc in single player shows "Save and exit" or simply "Exit to main menu"; then Single player asks whether to continue or start a new game; Settings get "Delete save game". Assistant's choices: Resume and Settings kept in the Esc menu (Esc used to toggle the menu), one save slot in localStorage (mission, seed, eaten voxels as run lengths, points, upgrades, panel settings; drifting pieces go back in place, the swarm restarts from its tunnel), the question only when a save exists, New game and Delete save game also clear the map's ticks, Delete asks once more, Exit without saving drops that game's points and upgrades.
- **Kuiper Belt at an angle (0.39.0, owner):** "in single player at least", like the owner's screenshot (the band running off diagonally). The band is tipped back 1 rad (`pitch`, every mode) and single player starts with the camera turned 0.35 rad (`view`); turning the band itself would have tripled its grid (≈ 8 million voxels), so the camera turns instead (assistant's choice).
- **Offline (0.38.0, owner):** the libraries are kept in the repo (`js/vendor/`) so nothing is loaded from the internet; multiplayer still needs it for PeerJS signalling.

## Working with the owner

- He prefers that new ideas are **proposed, not added on their own** — implement what he asks, list further ideas as suggestions.
- He tests on the live GitHub Pages site.

## Code map

See `docs/ARCHITECTURE.md` (modules and folders, how `Game3D` / `Swarm3D` are split over several files, game states, frame loop, swarm, planet, performance), `docs/MULTIPLAYER.md` (rooms, protocol) and `docs/CONFIG.md` (what the values in `js/config.js` do).

Licence: MIT (`LICENSE`), chosen by the owner.

## Publishing

- GitHub Pages deploys automatically from `main` via `.github/workflows/static.yml` (whole repository is the site).
- Versioning: bump `js/version.js`, add a `CHANGELOG.md` entry, tag the commit `vX.Y.Z`.
- The owner's clone is `C:\Users\micha\vsrepos\Hive-Hunger` (Windows).
- **Since 0.32.0 (2026-10-16) the cloud workspace can push `main` itself**: the owner connected GitHub to Claude. `git push origin main` works (the remote is `https://github.com/michalstankiewicz4-cell/Hive-Hunger.git`; the old lowercase name redirects). **Tags can't be pushed from there** (the proxy refuses tag refs and the GitHub API) — tell the owner the command for his clone: `git pull`, `git tag vX.Y.Z <commit>`, `git push origin --tags`. After `git pull` he runs `git tag vX.Y.Z <commit>` and `git push origin --tags` in PowerShell (red "NativeCommandError" text there is only git's progress; `* [new tag]` lines mean it worked).
- Each publish: run the seven test suites, update the docs, bump the version (one publish = one version), commit, tag, push `main`, give the owner the tag commands.

Older way, when the workspace had no write access (as done for 0.12.0–0.31.1):

1. Commit and tag in the cloud workspace, then `git bundle create hh.bundle vPREV..main vNEW`.
2. Copy the bundle into the owner's clone folder on his computer (a file transfer to the connected folder).
3. In Windows PowerShell in `C:\Users\micha\vsrepos\Hive-Hunger`: `git fetch hh.bundle main:refs/remotes/bundle/main refs/tags/vNEW:refs/tags/vNEW`, then `git merge --ff-only bundle/main`, delete the bundle, and `git push origin main vNEW`. PowerShell prints git's progress on stderr as a red "NativeCommandError" — that is not a failure; check for `main -> main`.

Older way (0.6.0–0.11.1), only as a fallback: fast-forwarding through the Linux shell linked to his computer (clone mounted at `~/mnt/Hive-Hunger`). That shell **cannot delete files** until the owner allows it (a permission prompt) — without it git leaves `.lock` files (`.git/index.lock`, `.git/objects/maintenance.lock`, `tmp_pack_*`) and can't replace changed files; remove leftover locks only if no git is running. Run git there as `git -c core.autocrlf=true -c core.fileMode=false …` (the clone has CRLF line endings, otherwise every file looks modified). It has no GitHub credentials, so the push still goes from PowerShell.

## Testing

Browser tests live in `tests/` (see `tests/README.md`): `test_solo.py` and `test_multi.py`, Playwright + headless Chromium with SwiftShader WebGL, Three.js / PeerJS from `tests/node_modules` (the same files as `js/vendor/`), a local PeerJS server, and `window.__dbg = game` added by rewriting `js/main.js` on the fly. `test_levels.py` checks the missions (the Kuiper Belt band and Earth), the map's bodies and the smooth surfaces (`SHOTS=<folder>` saves screenshots). `test_tree.py` checks the tree's nodes, points, buying, bonuses, lightning and the damage animation (`SHOTS=<folder>` saves the tree and a bolt). `test_fragments.py` checks pieces coming loose, drifting and being eaten. `test_editor.py` checks the ship editor, `test_tree_editor.py` the tree editor. Run all seven after every change. A refactor that should not change anything can also be checked by comparing with the previous version in a `git worktree`: geometry checksums of the smooth surface, screenshots of the panels with the canvas hidden.

Lessons from writing them:

- Fast-forward `game.update()` in chunks (e.g. 50 frames, then yield) — one long synchronous loop starves timers and network messages, so pings time out and players get dropped.
- On a small machine, pause guest pages after they join (`__dbg.stop()`); 4–5 pages rendering WebGL in software starve the CPU and the last one can't join. Paused pages still receive messages.
- Don't select buttons by text (`text=Single player`): the page has a visually hidden description for search engines with the same words. Use classes (`.menu-choice`, `.menu-start`) and keys (Esc, Tab).
- Pass/fail conditions about a new planet must allow for the swarm having started eating it already.

## Pitfalls (bugs that already happened)

- **`started` vs `running`** in `Game3D`: `running` = the render loop is on (`start()` / `stop()`); `started` = the match has begun (start screen / waiting room / Esc pause before or between). A text replacement once put `started = false` into `stop()`, which froze single player in tests.
- **Planet frame:** the simulation (swarms, voxels) never rotates; the camera, sky, sun and tunnels turn around the planet by `spin`. Tunnel positions are in the space frame (`spawnSpace`), compare them with swarm positions only through `spawnWorld()`.
- **No `hp <= 0` guard in `VoxelPlanet.remove()`**: an early return there once stopped every voxel from being removed (scores went up, the planet never shrank).
- **Ending at 100%:** never shatter the planet early (it used to shatter at 97%); units must be able to land on isolated scraps (`reachDistance`), or the last voxels are circled forever.
- **Claims:** a voxel claimed by a unit must be released whenever the unit drops it (`dropAllBites`, new planet, player leaving), or other units will never eat it.
- **Classes split over files (0.25.1, 0.25.2):** methods of `Game3D`, `Swarm3D`, `Player` and `VoxelPlanet` live partly in other files of their folder (`game/input.js`, `swarm/warp.js`, `game/ships.js`, `planet/eating.js`, …) and are added to the prototype at the end of the class file. Search for a method's name, not just the class file. A getter in such a part needs `Object.defineProperties` (as done there), `Object.assign` would read it once instead.
- **Smooth-surface colours:** the builder reads colours straight from the planet's `colors` table via `colorOffset`; a fragment's small grid passes the planet's table and an index mapping — keep both when changing either.
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
| 0.21.0 | tag `v0.21.0` | eating the nearest block always on; old eating mode, Spacing and Cohesion sliders removed |
| 0.21.1 | tag `v0.21.1` | tractor beam shaped to the piece's outline, 5% larger |
| 0.22.0 | tag `v0.22.0` | bombers with black holes (lensing, pull); lock checkboxes for the ship-type sliders |
| 0.23.0 | tag `v0.23.0` | orb ships (plasma orbs with a fiery tail) |
| 0.24.0 | tag `v0.24.0` | support ships (lightning between own ships) |
| 0.25.0 | tag `v0.25.0` | subspace tunnel at the spawn point; ships escape into hyperspace after a planet |
| 0.25.1 | tag `v0.25.1` | code split into folders and files, CSS per panel; faster smooth-surface rebuilds, shared textures, fewer per-frame allocations (no gameplay change) |
| 0.25.2 | tag `v0.25.2` | `Player` and `VoxelPlanet` split into files too (no gameplay change) |
| 0.26.0 | tag `v0.26.0` | cleaners (eat only pieces of 1–3 voxels); at most 100 units; arrows by the ship-type sliders |
| 0.27.0 | tag `v0.27.0` | drills with an orange spiral bit; Space pauses single player |
| 0.28.0 | tag `v0.28.0` | Settings (mouse, keyboard, graphics with FPS counter); free camera; no controls text on screen; weaker drills; trumpet-shaped tunnel |
| 0.29.0 | tag `v0.29.0` | piercers (orange beam with a yellow spiral lightning, through 3 voxels) |
| 0.30.0 | tag `v0.30.0` | piercers fire along a locked line until through, then 2 s more |
| 0.31.0 | tag `v0.31.0` | snipers; Ship guide; ship types panel grouped (attack / support) |
| 0.31.1 | tag `v0.31.1` | piercers through the whole planet, beam on into space; snipers keep their distance |
| 0.32.0 | tag `v0.32.0` | splashers: lens bubbles of liquid, 3 × 3 × 2 soak over 3 s |
| 0.33.0 | tag `v0.33.0` | boosters: pink octagon force fields, +20% Power inside |
| 0.34.0 | tag `v0.34.0` | solar system map; missions Kuiper Belt and Earth; test boards removed |
| 0.35.0 | tag `v0.35.0` | start screen picture with the title; loader |
| 0.36.0 | tag `v0.36.0` | the Kuiper Belt as a long band; grids that aren't cubes; Settings in three columns |
| 0.36.1 | tag `v0.36.1` | Ship guide fits the screen: only the ships scroll |
| 0.37.0 | tag `v0.37.0` | no automatic camera turning (planet spin off) |
| 0.38.0 | tag `v0.38.0` | Three.js and PeerJS in the repository (`js/vendor/`), no CDNs |
| 0.39.0 | tag `v0.39.0` | the Kuiper Belt seen at an angle |
| 0.40.0 | tag `v0.40.0` | Esc menu with Save and exit; Continue / New game; Delete save game; SEO and the start screen as the link preview |
| 0.41.0 | tag `v0.41.0` | Save game in the Esc menu; Polish keywords and description for search |
| 0.41.1 | tag `v0.41.1` | Tab pauses single player while the tree is open |
| 0.42.0 | tag `v0.42.0` | new tree layout: ships, their properties, swarm traits on levels 0–5 (logic later) |
| 0.42.1 | tag `v0.42.1` | documentation brought up to date; where the work stopped |
| 0.42.2 | tag `v0.42.2` | CONTEXT: the tags are on GitHub; how the owner adds them |
| 0.43.0 | tag `v0.43.0` | cutters: a flat red sheet that cuts whole rows, deeper until through |
| 0.43.1 | tag `v0.43.1` | cutters: slower haze, both edges glow, the whole width of a rock or a drifting piece |
| 0.43.2 | tag `v0.43.2` | cutters shine on 1 s after getting through; on the belt through one rock only |
| 0.44.0 | tag `v0.44.0` | the ship editor (`tools/ship-editor.html`) with Export / Import |
| 0.45.0 | tag `v0.45.0` | ship bar: choose a group, send it to a voxel or home, buy ships (free); start with 3 eaters; no settings panel / level switch; editor EN / PL |
| 0.45.1 | tag `v0.45.1` | tree: thin lines (drawn at screen resolution), a node's links light up under the pointer |
| 0.46.0 | tag `v0.46.0` | the tree editor (`tools/tree-editor.html`) with Export / Import, EN / PL |
| 0.46.1 | tag `v0.46.1` | autosave when a mission is done (note on the map); New game asks before deleting the save |
| 0.47.0 | tag `v0.47.0` | Charon (0.375 × Earth, icy, darker grey rock); a level's own surface look |
| 0.48.0 | tag `v0.48.0` | Pluto (0.75 × Earth, light grey rock, polar caps) |
| 0.49.0 | tag `v0.49.0` | Triton (0.85 × Earth: Pluto × 1.14 as in reality; like Pluto) |
| 0.50.0 | tag `v0.50.0` | Neptune (2 × Earth — really 3.9, too many voxels — light blue); tunnels and camera move out on big planets |
| 0.50.1 | tag `v0.50.1` | a ship bought comes out of the tunnel |
| 0.51.0 | tag `v0.51.0` | M: the map during a mission (pauses, no saving) |

## Known limitations

- The host's tab must stay in the foreground (browsers pause animation in background tabs → the game pauses for everyone).
- Multiplayer depends on the PeerJS public server for joining; strict NATs without TURN may fail to connect (no TURN server is configured).
- With slow defaults (3 eaters, speed 0.05) a planet takes a long time; buying ships on the ship bar (free for now) speeds it up.
- A huge, fast swarm crumbles a planet into thousands of small drifting pieces (each its own small mesh); with 1500 units at full power (before 0.26.0 limited swarms to 100) the frame time roughly doubled while it lasted. Normal swarms add about 1–2 ms per frame.
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
