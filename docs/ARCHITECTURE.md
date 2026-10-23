# Architecture

Hive Hunger is a static web page: ES modules, Three.js r128 (UMD build) and PeerJS 1.5.4, both kept in `js/vendor/` (nothing comes from a CDN) — no build step, no server code. Almost every tunable value lives in `js/config.js` (upgrade costs and the lightning's base values in `js/core/SkillTree.js`).

## Modules

```
js/
  main.js, config.js, version.js
  core/          rules without graphics: the swarm's brain, the upgrade tree
  three/
    game/        the game: Game3D (+ its parts), Player
    swarm/       the swarm: Swarm3D (+ its parts), steering
    planet/      the voxel planet, its smooth surface, drifting pieces, level shapes
    effects/     lightning, support bolts, orbs, black holes, debris
    scene/       sky, spawn tunnel, click marker
    textures.js  small glow / gradient textures shared by the effects
  net/           multiplayer over PeerJS, binary messages
  ui/            HTML panels and menus
  utils/         noise, terrain and sky colours
css/             one stylesheet per part of the page
tools/
  ship-editor.html  the ship editor: a stand-alone page (no game running) that imports js/config.js,
                    js/version.js and SHIP_INFO from js/ui/ShipGuide.js; Export / Import JSON
  tree-editor.html  the tree editor: imports NODES / BRANCHES (js/core/SkillTree.js), CONFIG, SHIP_INFO;
                    Export / Import JSON
  voxel-editor.html the voxel editor: kinds of voxels (rock = the game today, water, iron, lava …);
                    imports CONFIG, SHIP_INFO, SOLAR; Export / Import JSON
```

**Classes split over several files.** `Game3D`, `Swarm3D`, `Player` and `VoxelPlanet` are big, so their methods live in several files: each part file exports an object of methods (`export const Input = { bindInput() {…}, … }`), and the class file adds them to its prototype at the end (`Object.defineProperties(Game3D.prototype, Object.getOwnPropertyDescriptors(part))`). The methods behave exactly as if they were written in the class (`this` is the game / swarm); to find one, search for its name. A new part: write the file, import it in the class file and add it to the list there.

| File | What it does |
| --- | --- |
| `js/main.js` | Entry point: reads `?room=`, creates the game (solo or guest), the ship bar, the start screen, room panel, summary and upgrade tree; Tab / Esc keys; starts the loop |
| `js/config.js` | All parameters: planet, flock, feeding, ship types, spawn tunnel, hyperspace jump, marker, network; `GROUP_KINDS` (the ship bar's groups: `SHIP_KINDS`, eaters last) |
| `js/version.js` | Game version (keep in sync with `CHANGELOG.md`) |
| `tools/ship-editor.html` | The ship editor: values (Play / Look) of the whole swarm and every ship type read from `CONFIG`, each ship's targets in order of priority and its tasks in order (standard tasks = what the game does today, written in the editor as `DEFAULT_TASKS` / `DEFAULT_TARGETS` — keep them in step with the ships), notes; kept in localStorage; Export saves a JSON file with every change (path in `CONFIG`, old and new value), Import loads it back. It changes nothing in the game |
| `tools/tree-editor.html` | The tree editor: the game's tree (`NODES`, `BRANCHES`) on a canvas laid out like the game's (rings, angles); select / drag / add / connect / delete nodes, per-node fields (name, kind, branch, ship, own words, text, cost, level, angle, any / all parents, soon, colour), branch colours, a palette of 16 (`pastel()` of the ships' colours); kept in localStorage; Export = the whole tree + `diff()` against the game's; it changes nothing in the game |
| `js/settings.js` | The player's own settings (camera turning, zoom speed, FPS counter, resolution, smooth edges, effects), remembered in the browser; `onChange` listeners |
| **`js/three/game/`** | |
| `Game3D.js` | Scene, camera, renderer, roles (solo / host / guest), players and their spawns, planet lifecycle (`startTestBoard` / `leaveTestBoard`: `testBoard` — `levelLook` and `bodyId` come from `CONFIG.testBoard`, an eaten board is rebuilt at once; `fitToPlanet`: a planet bigger than Earth moves the tunnels and the camera out by R / `planet.radius`; spawns are kept Earth-sized in `Player.spawnBase`), the frame loop (`update`, `updateSim`, `start`) |
| `input.js` | (Game3D) mouse and touch: a tap on a voxel (planet or drifting piece — `raycastSolid(ray, out, true)`; empty space does nothing) sends the group chosen in the ship bar (`game.group`), on the tunnel calls that group home; `buyShips` (a guest asks the host), camera turning and zoom, screen → world point. The camera's orientation is a quaternion (`orbit.q`) turned around its own axes, so it can go over the poles; the planet's spin is added about the world's Y axis |
| `destruction.js` | (Game3D) what ships do to voxels: bites, storm bolts, bomber blasts, orb bursts, support lightning, black holes swallowing pieces |
| `host.js` | (Game3D) host side: summary after a planet, PvP winner, Next planet, guests' commands and purchases, buying upgrades |
| `guest.js` | (Game3D) guest side: following the host — snapshots, planets, pieces, jumps, orbs, bolts, black holes, settings, tree |
| `hud.js` | (Game3D) HUD text: progress, status line (jumping, called back, connecting — no description of the controls), scores and pings, notices |
| `graphics.js` | (Game3D) graphics settings: making the renderer (resolution, smooth edges — a new renderer and canvas when it changes, input bound again), amount of effects, frames per second |
| `players.js` | Player names and colours in multiplayer |
| `Player.js` | One player: swarm + leader + tunnel + settings + score; setting up; **groups** (`groups`, one per `GROUP_KINDS`: mode `go` with a `point` or `home`), `command(point, kind)`, `recall(kind)`, `updateGroups` (a group sent somewhere carries on as usual once one of its ships got there), `buyShips(kind, n)` (a new unit moved to the end of its type so no other ship changes type; hidden in the tunnel until `arriveBought` opens it and lets it out); `sellShips(kind, n)` (ships.js: `leaving` set, they jump next frame; `removeLeft` removes them once gone with `removeUnit`, which keeps every other ship's type — bombers that blew up use it too); settings, a new planet, the per-player frame step |
| `arrival.js` | (Player) the tunnel: ships coming out of it, the jump to hyperspace, the spawn point and where it is in the world |
| `ships.js` | (Player) ships with their own jobs: tugs towing pieces home, removing bombers that blew up, orbs, support ships' lightning |
| `upgrades.js` | (Player) points, buying upgrades, bonuses on top of the base values, chain lightning |
| **`js/three/swarm/`** | |
| `Swarm3D.js` | The flock (boids): per-unit state, neighbour grid, feeding, collisions, getting unstuck, aiming, drawing the ships |
| `types.js` | (Swarm3D) ship types by unit index, their colours, swapping two units |
| `remote.js` | (Swarm3D) a guest's copy of a swarm; the beam and bolt lists sent to guests |
| `warp.js` | (Swarm3D) the jump to hyperspace and its streaks |
| `beams.js` | (Swarm3D) laser beams, storm ships' forked lightning |
| `tows.js` | (Swarm3D) tugs' tractor beams shaped to the piece |
| `drills.js` | (Swarm3D) drills' spiral bits, the list of drilling units |
| `cutters.js` | (Swarm3D) cutters' sheets: a quad from a narrow apex at the ship to the row being cut, a shader with two red edge rays and drifting haze (additive), a line along the cut; `disposeExtras` (fields and sheets when a player leaves) |
| `fields.js` | (Swarm3D) boosters' force fields: which ships are inside one (`boosted`), the pink ball of octagonal cells drawn round each booster (a shader on a sphere) |
| `steering.js` | `aroundPlanet()` (fly around the planet, not through it), `nearOwnBite()` |
| **`js/three/planet/`** | |
| `VoxelPlanet.js` | Voxel planet: building the grid from the level's shape and seed (a belt also places its rocks from the seed), coordinates, what is solid (also on drifting pieces), syncing, disposing |
| `look.js` | (VoxelPlanet) materials, terrain and letter colours, the drawn cubes (exposed voxels as instances), damage on them |
| `eating.js` | (VoxelPlanet) bites, claims, chain lightning weakening voxels, removing voxels (grid or piece), the removal log, shattering |
| `search.js` | (VoxelPlanet) exposed voxels near a point, the nearest free voxel, matter for the brain, raycasts |
| `runs.js` | (VoxelPlanet) eaten voxels as run lengths for players who join mid-planet |
| `grid.js` | `BITE` results, the six neighbours, offsets within 2 voxels |
| `Fragments.js` | Pieces bitten off the planet: finding splits (flood fill from the neighbours of eaten voxels), drifting and turning, their own smooth surfaces, eating them, the spatial hash the swarm uses to find and avoid them |
| `PlanetSurface.js` | Extra planet graphics over the voxels: `smooth` (surface nets) and `wedges` (ramps and corner pieces in the steps), built per 16³ chunk and rebuilt as voxels are eaten (within `budgetMs` per frame) |
| `shapes.js` | Which voxels are solid for a level's `shape`: `sphere`, `belt` (the Kuiper Belt's band, a grid that isn't a cube); `cube`, `pair`, `boxes`, `text` (test boards, not missions any more) |
| **`js/three/effects/`** | |
| `Lightning3D.js` | Lightning bolts (chain lightning, storm ships): a jagged 1-px white core with a thin glow ribbon (`glowPx` = 2 px each side, turned to the camera every frame), flickering out |
| `Zaps.js` | Support ships' lightning: a seeded, bent bolt through a chain of ships with flowing energy and branches, run from ship to ship; reports each finished jump |
| `Orbs.js` | Plasma orbs of orb ships: flight to the target, pulsing glow, fiery tail (a point cloud with per-point size and colour), burst flash |
| `Shots.js` | Snipers' shots: flight speeding up per voxel, the meteor-like cap, wake, flash at the hit |
| `Bubbles.js` | Splashers' bubbles of liquid: flight to the target (following a moving piece), wobble phase; `lenses()` gives the lens pass their positions and sizes |
| `BlackHoles.js` | Black holes after bomber blasts: strength over time, pulling and swallowing debris and pieces, the lensing render pass (also the splashers' bubbles: irregular, wobbling drops that magnify and flip the view inside, with a blue tint, a rim and a highlight; up to 16; hidden behind the planet) |
| `Debris3D.js` | Debris point cloud |
| `Liquids.js` | Droplets of liquid voxels let loose (water, lava): no gravity, damping, cohesion between droplets of the same liquid within `reach`, a push closer than `rest`, a soft bounce off solid voxels (spatial hash); `pull` / `take` / `nearest` for siphons; one instanced mesh per liquid |
| **`js/three/scene/`** | |
| `Space3D.js` | Sky sphere with nebulae + star layers (one group, turned by the spin) |
| `Portal3D.js` | The subspace tunnel at each player's spawn point: opens, closes, pulses; ships come out of it; click it to call the swarm back |
| `ClickMarker.js` | Ring shown where the player clicked |
| `js/three/textures.js` | Canvas textures: radial and linear gradients, the shared glow-band texture |
| **`js/core/`** | |
| `Leader.js` | The swarm's "brain": a point the flock heads for; stays at matter, finds new matter, follows clicks |
| `SkillTree.js` | Upgrade tree data and rules: nodes (branch, kind — core / swarm / ship / prop — parents with `all`, level `depth` 0–5, angle, cost, effect, `soon` = shown but not built yet), buying, adding up the effects |
| **`js/net/`** | |
| `Net.js` | `NetHost` / `NetGuest` over PeerJS: rooms, joining, pings, timeouts, events |
| `Protocol.js` | Binary snapshot, planet and fragment messages |
| **`js/ui/`** | |
| `Hud.js` | Planet counter, points counter, hints, notices, multiplayer scoreboard and banner |
| `ShipBar.js` | The ship bar (bottom): a thumbnail of every type (the Ship guide's still picture, `paintShip`) in `SHIP_GROUPS` order with how many you have (`countsOf(swarm)`; a guest's numbers come with the host's snapshots), click = choose the group (`game.group`, one at a time), + = `game.buyShips` (Shift: 10) |
| `SolarMap.js` | (`state.playing`: opened with M during a mission — that body "Now playing" with "Back to it") The solar system map (`#map`, over the game): its own WebGL renderer and scene, made when first shown — the Sun (glow sprite, point light), orbit circles, bodies along them (moons round their planets, canvas textures: bands on the giants, land on Earth), rings, the belts as points, HTML labels; drag / wheel / pinch turn and zoom; a click (raycast on invisible hit spheres, belts by the orbit plane) opens the card: a 2D-painted picture, kind, text, task, Start / Coming soon; the next mission pulses |
| `StartScreen.js` | `showPause` (Esc in single player: Resume, Save game, Save and exit, Exit to main menu, Settings), `showContinue` (Continue / New game when a save exists), `showConfirm` (a question with a yes and No: New game asks before the save is deleted), `showDevTools` (tiles: the three editors in a new tab, the test board); start screen over the start picture (`img/start.jpg`, class `is-splash`; also the Ship guide and Settings opened from it): the title and Single player / Co-op / PvP / Ship guide / Settings and the multiplayer waiting room (link, players, Start) |
| `Summary.js` | Multiplayer summary after a planet: per-player results, winner, Next planet |
| `Lobby.js` | Room panel during a multiplayer match: room, link, leave |
| `TreeView.js` | The tree view (Tab): laid out in "art pixels" (`P` screen pixels each) and drawn at the screen's resolution — icons and level numbers as pixel art (P × P blocks), links, level rings and node outlines one screen pixel thin (canvas paths); ships as hexagons, the swarm's traits as diamonds, ships' properties as small circles, links across branches (dashed: either parent); hover: tooltip and the node's links lit up (drawn last, wider, with a glow); click to buy |
| `ShipGuide.js` | The Ship guide in the menu (a window no taller than the screen: the title and Back stay, the ships scroll in `.guide-scroll`): per type a 120 × 64 canvas picture drawn in 2D (`PICTURES`), its name and what it does, attack and support apart (`SHIP_GROUPS`); pointing at one (or focusing it) loops its shot |
| `SettingsView.js` | The Settings screen in the menu: Mouse (controls, camera turning, zoom speed), Keyboard (keys), Graphics (FPS counter, resolution, smooth edges, effects) side by side in three columns (`.settings-columns`; stacked under 820 px), Reset settings, Back |
| `dom.js` | Small DOM helpers for the menus |
| `js/utils/*` | Noise (fBm), terrain colours, nebula/star colours |
| **`css/`** | Loaded in this order (later files may override earlier ones): `base.css` (colours, page, hidden helpers, version), `hud.css`, `panel.css` (settings, level switch, ship types; narrow screens), `lobby.css`, `menu.css` (start screen and its picture, waiting room), `map.css` (the solar system map), `summary.css`, `points.css`, `tree.css` |

## Loading

`index.html` shows `#loader` at once (its styles inline, a tiny blurred copy of the start picture as a data URI): the title, a bar and what is loading. `window.HH_LOAD.done(step)` ticks off `image` (the start picture, preloaded), `three` and `peer` (the scripts' onload / onerror) and `game` (`main.js`, after `Game3D` is made, or when the 3D library is missing); when all four are done it fades out and is removed.

## Game states

```mermaid
stateDiagram-v2
    [*] --> StartScreen
    StartScreen --> Map: Single player (new game or Continue a save)
    Map --> Playing: Start on a mission's card
    Map --> StartScreen: Back / Esc
    Playing --> Paused: Esc (single player)
    Paused --> Playing: Resume / Esc
    Paused --> Paused: Save game
    Paused --> StartScreen: Save and exit / Exit to main menu
    Playing --> Map: mission eaten, ships gone (single player)
    StartScreen --> WaitingRoom: Multiplayer · Co-op / PvP
    [*] --> WaitingRoom: open a room link
    WaitingRoom --> WaitingRoom: Start / Not ready, players join or leave
    WaitingRoom --> Playing: everyone pressed Start
    WaitingRoom --> StartScreen: Leave room
    Playing --> StartScreen: Leave room / host left / connection lost
    state Playing {
        [*] --> Eating
        Eating --> Jumping: last voxel eaten (multiplayer: summary)
        Jumping --> Arriving: every ship gone to hyperspace (multiplayer: + everyone pressed Next planet) → next planet
        Arriving --> Eating: the tunnel opens, the ships come out, it closes
    }
```

- **Start screen** and **waiting room** are the overlay (`StartScreen`); `game.started` is `false`, so swarms wait at their tunnels and the planet doesn't turn. In single player **Esc** sets `started` back to `false` and shows the pause menu (`StartScreen.showPause`: Resume, Save game, Save and exit, Exit to main menu, Settings); Esc again or Resume carries on. **Tab** (the tree) also stops single player (`game.paused`) while it is open. Creating a room (`Game3D.becomeHost`) starts from scratch: a new planet 1 and a new host player (no points, upgrades or eaten voxels from single player); only the settings panel values are kept.
- **Playing:** `game.started` is `true`. In multiplayer the room panel (`Lobby`, bottom left) has the link and **Leave room**; leaving reloads the page without `?room=`, i.e. back to the start screen.
- Someone who opens a room link while the match is running skips the waiting room.
- **Jumping:** after the last voxel, `Player.jumpOut` sets `homeMode = 'jump'` and `Swarm3D.jumpAll` gives every ship a random delay within `swarm.warp.window`; when it runs out (`stepWarp`, host) the ship speeds up away from the planet (`accel`, up to `maxSpeed`), leaves a streak (`renderTrails`) and after `warp.frames` is hidden. The next planet appears when every ship is hidden (`Player.departed`) or after `beacon.returnTimeoutFrames`.
- **Arriving:** on a new planet every ship is hidden; `Player.updateArrival` opens the tunnel (`pending → opening`), lets the ships out at random moments within `portal.emergeWindow` at its mouth, heading out of it (`emerging`), and `linger` frames after the last closes it (`done`). In multiplayer the summary (`Summary`) is open meanwhile and the next planet also waits until every player has pressed **Next planet** (`Player.nextReady`).

## Planet levels and looks

`CONFIG.levels` are the missions that can be played, in the solar system map's order; each names its map body (`body`, see `js/solar.js`) — `shape`, `radiusScale` (× `planet.radius`) and `style`. `Game3D.missionIndex(level)` says which: in single player `Game3D.mission` (picked on the map: `startMission(id)`), in multiplayer `(level − 1) mod length` — the missions go in order, so every client works it out from the planet number and multiplayer needs nothing extra. `Game3D.levelLook(level)` turns the entry into the planet's radius and style; `bodyId` / `nextBodyId` name the bodies (HUD, summary, map).

**Saving** (`js/save.js`, one slot in localStorage): `Game3D.saveData()` — the mission's body, the planet's seed, the eaten voxels (`eatenRuns`, base64), points, the tree, the panel settings and ship types; `Game3D.loadSave(data)` builds that mission's planet from the seed, removes the eaten voxels and starts it (the swarm from its tunnel); `resetProgress()` (New game, Exit without saving) drops points and upgrades. Settings → Delete save game (`fillSettings(…, saves)`) clears the save and `progress`.

**Single player flow:** Single player → the map (`SolarMap.show`, the first mission not done marked) → Start → `Game3D.startMission` (`jumpToLevel`, `started`) → … the planet eaten, the ships gone → the next mission is built behind the map, `started` = false, `onMissionDone(id)` → `progress.complete(id)` (localStorage, `js/progress.js`) and the map again. Esc on the map returns to the start screen; Esc during a mission pauses it (`StartScreen.showPause`), Esc again carries on. **Multiplayer:** `main.js` shows the map (mode `multi`, no Start) while the room is waiting or the summary is up — the next mission marked.

**The map's data** (`js/solar.js`, `SOLAR`): 20 bodies from the outside in (Kuiper Belt … Sun) — id, name, kind, type (`belt`, `dwarf`, `planet`, `moon`, `star`), parent (moons), map orbit and size, speed, tilt, colour, rings, text. A body is playable when `CONFIG.levels` has it.

Shapes (`shapes.js`) decide which voxels are solid (`sphere`, `belt`, `cube`, `pair`, `boxes`, `text`). `belt` (the Kuiper Belt) places `count` rocks from the planet's seed (mulberry32 — the same belt on every screen): each two or three overlapping balls, `minSize`…`maxSize` voxels across, in a long band facing the starting camera — `length` × the radius along x, `width` across (y), `thick` voxels deep, bent along its length on an arc whose middle is `curve` × the length nearer the camera than its ends — at least 3 voxels apart (none touching); a colour per rock (tags; 16-bit when there are more than 255 rocks); tipped back by `pitch` (it isn't turned about y — that would make the grid far bigger; single player turns the camera by the level's `view` in `startMission` instead); its grid isn't a cube (`dims` = [NX, NY, NZ]); the swarm flies round only a tiny sphere (`R` = 2 voxels), the rocks themselves are what it slides along. `boxes` lays out every box shape up to max×max×max once (x ≥ y ≥ z, no rotated copies): one row per depth, boxes from the smallest, `gap` apart; each box has its own colour (tags, like the text's letters). A `pair` has `parts` — each part (the sphere and the cube) gets its own terrain, measured from its own centre (`VoxelPlanet.partAt`). The grid is centred on the origin: `NX × NY × NZ` voxels (a cube for every shape but the belt), voxel (i, j, k) at index `(k·NY + j)·NX + i`, its centre `((i + 0.5)·s − HX, …)` (`half` = half the longest edge); each shape also gives the radius the swarm flies around on long trips (`R`: the sphere's radius, the cube's half-edge, half the text's thickness) and a bounding sphere for clicks (`bound`). Terrain colours follow the surface: sphere — depth under the radius, cube — depth under the nearest face; the text uses a colour per letter. Only spheres get the smoothed shading.

Styles change only the graphics — collisions, claims and eating always use the voxels. Every level uses `smooth` (the owner's choice since 0.13.0; an extra-smooth variant was tried in 0.14 and removed); `cubes` and `wedges` stay available. On a `pair`, the sphere's normals lean towards its own centre (like `sphereShading` on single spheres):

- `cubes` — the instanced voxel cubes.
- `smooth` — the cubes are hidden; `PlanetSurface` draws a surface net: one vertex per grid cell the surface passes through (the average of the solid/empty crossings on its edges) and a quad for every solid/empty pair of neighbouring voxels. Steps become slopes and corners round off without a case table. Colours are averaged from the solid voxels around each vertex. The field isn't just solid/empty: a solid voxel has density 0.5 + 0.5 × (strength left), so as it is eaten or weakened the surface over it sinks towards its centre and darkens — the destruction animation on a smooth planet. Text letters must have their pixels touching by a side, or the surface splits them.
- `wedges` — the cubes stay; every empty cell resting on a solid voxel (below = towards the planet centre along the main axis) gets a piece: a ramp next to one solid side, an inner corner next to two adjacent sides, an outer corner next to a solid diagonal.

The surface is split into chunks of 16³ voxels. `VoxelPlanet.remove()` and `showDamage()` mark the chunks around the voxel dirty; `sync()` rebuilds them for up to `budgetMs` (3 ms) per frame, at least one (a guest joining mid-planet rebuilds all at once). Each rebuild first copies the chunk's densities into a small block, then builds the mesh from it. To try a new look: add a builder to `BUILDERS` in `PlanetSurface.js`; a new shape: a case in `shapes.js`; then a level with its name in `CONFIG.levels`.

## Points, upgrades and lightning

- **Points** = `player.score − player.tree.spent`; `score` counts eaten voxels (1 voxel = 1 point).
- **Upgrades** (`SkillTree`): every node is bought once and needs its parent. `Player.base` keeps the base values (count — raised by buying ships —, speed, power); `Player.applyUpgrades()` sets the swarm to base + bonuses (units +, speed ×, bite radius +) and the lightning settings.
- **Chain lightning** (`Player.updateLightning`, host / single player): every `interval` seconds a bolt starts at a random drone and jumps to the nearest drone not hit yet within `range`, `jumps` times. `VoxelPlanet.weakenAlong` takes `damage × strength` from every voxel on the path (down to 5%, never removing it). `Game3D.showBolt` draws it and the host sends it to guests.
- **Destruction animation** (`VoxelPlanet.showDamage`): whenever a voxel loses strength the smooth surface over it sinks and darkens (see above); with the `cubes` style its instance is scaled down (to 45%), darkened and jittered instead. Removal emits debris as before. Guests don't receive voxel strength, so they see only the debris.
- **Multiplayer:** each player has their own tree on the host; a guest sends `buy`, the host checks the guest's points and answers with `tree`.

## Frames of reference and the planet spin

The simulation runs in the **planet's frame**: voxels never move. (The spin is off since 0.37.0 — `planet.spinSpeed` 0 — the code stays.) To make the planet look like it spins, the camera, the sky group, the sun and the tunnels (they live in the sky group) turn around the planet by `spin` (`planet.spinSpeed` per frame). The swarm flies in the planet's frame, so on screen it turns together with the planet. A beacon moves in the planet's frame, so a swarm flying home follows a slowly moving target.

## One frame (solo / host)

Until the match has started (`game.started`: Single player chosen, or every player in the room pressed Start; Esc in single player sets it back to `false`, which pauses the game) the frame only draws: swarms wait at their tunnels and the planet doesn't turn.

1. `spin += spinSpeed`, apply it to camera, sky and sun.
2. For every player (`Player.update`):
   - collect exposed voxels within `leader.feedSenseRadius` of the swarm target (`VoxelPlanet.exposedNear`) and count the free (unclaimed) ones;
   - update the leader: stay while free voxels are near, otherwise drift to the nearest free voxel; follow a click or the tunnel when told to;
   - update the swarm (`Swarm3D.update`).
3. Drifting pieces move and turn (`Fragments.step`); voxels eaten this frame are checked for splits, and every part smaller than the rest comes loose (host: sent to the guests).
4. If the planet's last voxel is gone: every swarm flies home; when all have gathered (or after a timeout) the next planet appears.
5. Host only: every `net.snapshotEvery` frames, send a snapshot to the guests (every `fragments.syncEvery` frames also where the pieces are).

## The swarm (`Swarm3D.update`)

- **Flocking (boids):** separation (within `separationDistance`), alignment and cohesion with neighbours found through a spatial hash grid, plus steering towards the unit's target. Every unit flies at the same constant `speed`; only its direction changes, at most `turnRate` per frame. The ship's nose (`look`) follows that direction smoothly (`turnSmoothing`) — in the simulation, because a landed ship eats only once its nose faces its bite within `aimAngle` (`aim()`).
- **Groups:** `fillKinds()` gives every unit its type index once a frame (`kindOf`, `GROUP_KINDS` order); `world.groups[kindOf[i]]` is what its group was told (`Player.groups`). A group sent somewhere (`go`) picks its next bites nearest to `point` (units with `redirect` set); its units without a bite — and those that don't eat — steer for `point`. A group called home (`home`) doesn't eat (`held`: no new bites, drills / piercers / cutters / snipers stop) and steers for the tunnel. `world.holding` (the jump to hyperspace) holds everyone.
- **Feeding:** a unit without a bite picks the nearest free voxel to itself (after its group was sent somewhere: to that point) and flies straight to it — no alignment or cohesion while it has a bite, only separation. The voxel is **claimed** (`VoxelPlanet.claims`), so nobody else takes or bites it; bites are shared only when the planet has fewer exposed voxels than there are units. A unit lands when it touches its bite (or a free voxel right next to it) or comes within `reachDistance`, then eats a crater of radius `power` over `eatFrames` frames, skipping voxels claimed by others.
- **Collisions:** movement goes axis by axis in substeps; a solid voxel stops movement on that axis — no bounce and no passing through; the unit slides along the surface. Units in passing never eat.
- **Long trips:** `aroundPlanet()` gives a waypoint over the surface when the straight path would go through the planet, or straight up when the unit is down in a pit.
- **Laser ships:** units `0 … lasers−1` (`Swarm3D.lasers`, from the player's `lasers` setting, at most all units) are red laser ships: they land at `laser.reach` (2.5) from their bite instead of `reachDistance`, eat it from there — but only once their heading (`look`, turned in the simulation by `turnLook`) faces the bite within `aimAngle` (`aim()`; eaters too) — and fly at `laser.speedFactor` (0.9) × the speed. `render(camera)` colours the units (instance colours) and draws a glowing band (a camera-facing quad with a white-core-to-red gradient, additive) from every firing laser ship to its bite, plus a glow sprite where it hits; on a guest the beams come from the snapshot.
- **Storm ships:** the next `storms` units after the laser ships. They land at laser range like laser ships and, once aimed, call `world.storm` → `Game3D.stormCell` instead of `bite`: the damage a laser would do this frame (`strength / eatFrames` × the voxels of a Power crater) is split — `storm.centre` (0.4) on the bite, `storm.side` (0.3) on each of the two nearest unclaimed voxels of the same body (`VoxelPlanet.nearestAround`). `renderStorms` shows a flash every `storm.flashEvery` frames with the chain-lightning look (`Lightning3D`): ship → fork point at `storm.fork` (70%) → bite, and two weaker bolts from the fork to the side voxels.
- **Tugs:** the next `tugs` units after the storm ships; they never pick bites. `Player.updateTugs` (host) gives each tug the nearest drifting piece nobody tows (`fragment.tug`) and a point to fly to (`Swarm3D.tugGoal`): the piece's near side, or — once within `tug.range` and holding it (`fragment.towed`, no damping or drift limit) — ahead of the piece towards home, while it sets the piece's velocity towards the tunnel (`aroundPlanet` waypoints) at `tug.pull` × the swarm speed. At the tunnel (it opens for a moment) `deliver` removes the piece's voxels as eaten (logged for guests) and adds `tug.reward` × their number to the score. `Swarm3D.tows` ([unit, piece id]) drives the tractor beam meshes (`shapeTow`): the piece's outer voxels (a sample of `tug.outlinePoints`) are flattened across the beam onto the piece's centre, their convex hull grown to `tug.outlineScale` (5% larger) plus half a voxel is the outline, and the beam is a fan of additive triangles from the tug to it (glow fading away from the tug) plus light streaks ending inside it, re-drawn every few frames; guests get the tows from the snapshot.
- **Bombers:** the next `bombers` units after the tugs. They pick bites like eaters; landed, they call `world.bomb` → `Game3D.explode`: every voxel within `bomber.radius` of the bite (grid and drifting pieces) is removed as eaten, a point each, and a black hole is added (and sent to the guests). The bomber is put on `Swarm3D.dying`; after the update `Player.removeDead` swaps it to the end of the swarm (past the other bombers and the eaters, so every type keeps its places) and lowers the Units and Bombers settings by one (guests are told with a `settings` message).
- **Black holes** (`BlackHoles.js`): per hole a strength 0 → 1 → 0 over `grow` / `hold` / `shrink` frames. Each frame it pulls debris and (host) drifting pieces within `range`, gently (`pullDebris`, `pullPieces`, `maxPieceSpeed`); debris within `core` is gone, a piece is swallowed (`Game3D.swallow`). Drawing: while a hole is up the scene is rendered into a texture and then drawn through a full-screen shader that moves each pixel's sample point like a point lens (β = θ − θE²/θ, θE = `size` × strength projected on screen), with a black disc inside 0.55 θE and a thin ring.
- **Orb ships:** the next `orbs` units after the bombers. They land at `orb.range` from their bite and, aimed, call `world.fireOrb` → `Game3D.fireOrb` (`Orbs.js`) unless their orb is still flying (`Swarm3D.orbOut` = its id). The orb flies at `orb.speed`, following its target voxel (on the host), leaving tail sparks; at the target `Game3D.orbBurst` → `destroySphere(orb.blast)` and `Player.orbDone` lets the ship fire again. Guests get `{t:'orb'}` and fly the same orb (the burst's voxels arrive in snapshots).
- **Support ships:** the next `supports` units after the orb ships; they never pick bites. `Player.updateSupport` counts down `Swarm3D.zapWait` per support ship; at 0 it builds a chain (the ship, then up to `support.jumps` random other ships, each within `support.jumpRange` of the last) and calls `Game3D.zap`, which hands it to `Zaps.add` with a random seed (sent to guests). `Zaps` makes the shape from the seed — per jump a smooth random bend across it (zero at the ships) plus a little jag, and short forked branches — relative to the ships, so it follows them; the bolt's head runs along the chain over `support.life` frames and each finished jump calls back with its world points, where the host destroys every voxel on the way (grid and pieces). Drawn as 1-px cores with vertex colours (energy pulses moving along) and camera-facing glow ribbons (4 px main, 2 px branches).
- **Liquids:** a level's `liquids` (shape tag → `water` / `lava`) makes `VoxelPlanet.eaten` push every liquid voxel that goes to `spills`; `Game3D.takeSpills` lets them loose as droplets (`Game3D.liquids`) and takes their points back (single player). **Siphons** (the last of `SHIP_KINDS`) are passive: `Player.updateSiphons` gives each the nearest droplet as its goal (`tugGoal` / `tugHas`, like a tug's piece), draws in droplets within `siphon.range` and takes in those within `siphon.take` (a point each).
- **Cleaners:** the next `cleaners` units after the support ships. Instead of `pickFood` they call `world.pickScrap`: the nearest unclaimed voxel of a drifting piece with at most `cleaner.maxPiece` voxels (the player lists those pieces once a frame, `Player.scraps`); with none, they have no bite and fly with the swarm. They land and bite-through-when-stuck only on such voxels (`world.isScrap`), so they never eat the planet or a bigger piece; a bite that stops being one (a slider moved the unit to another type) is let go.
- **Drills:** the next `drills` units after the cleaners. They pick bites like eaters; landed on a planet voxel they pick a direction (towards the centre, ± `drill.spread` at random, `drillDir`), turn to it (`aimDrill`), drop the bite and drill: every frame they move `drill.speed` along it and call `world.drill` → `Game3D.destroySphere(drill.radius)` just ahead of the nose, until `drill.emptyFrames` frames without a voxel or `drill.maxLength` (`drillLeft`). Drilling ships skip steering and collisions. Bits (`swarm/drills.js`): a cone with a spiral texture along the drawn heading, turning; the host sends which units drill in the snapshot.
- **Piercers:** the last `piercers` units. Ranged like laser ships (they land at `piercer.reach`, 10 units). Once aimed at a grid bite they lock the line from themselves through it (`pierceDir`), drop the bite and fire along the line every frame: `world.pierceLine` → `Game3D.pierceLine` walks it half a voxel at a time all the way past the far side of the grid and bites the first `piercer.pierce` solid voxels (claimed or not — everything on the line) for `piercer.damage` × the eater rate; the beam ends at the nearest one (`pierceEnd`). With none left it is through: the beam end goes `piercer.farLength` out into space and `pierceAfter` counts `piercer.afterFrames` (2 s), then `pierceOn` goes off and the ship picks its next bite. On a drifting piece they just bite it (`Game3D.pierceCell`). Drawing (`swarm/beams.js`): a second set of beam meshes in orange (`makeBeams` takes the colours from the config) and a yellow spiral bolt per beam every `flashEvery` frames (`Lightning3D` with a 4-px glow). Their beams go to guests in the same beam list as lasers.
- **Snipers:** the last `snipers` units. They never land: with a bite (anywhere) they stop (`snipePhase` 1), turn to it and charge `sniper.chargeFrames`; then `world.fireShot` → `Game3D.fireShot` (`effects/Shots.js`, sent to guests as `{t:'shot'}`) and they move for `sniper.moveFrames` before stopping again — heading for the point over the swarm target at their own height, with any inward part of their motion removed, so they never close in on the planet. A shot follows its target voxel (host), its speed is `speed × accel^(voxels flown)`, and at the target `Game3D.shotHit` removes that voxel (or the one at the spot if it went meanwhile). Drawn as a thin box, a half-sphere cap in front with a rim-glow shader, a halo sprite and a wake line, all growing with the speed.
- **Splashers:** the last `splashers` units. Landed at their bite (`splasher.range`), with no bubble out (`splashOut`) they call `world.fireBubble` → `Game3D.fireBubble` (`effects/Bubbles.js`, sent to guests as `bubble`). When the bubble lands, `Game3D.splash` (`game/destruction.js`) frees the ship (`Player.splashDone`) and, on the host, picks the block: the hit voxel's main outward axis is `up`; 3 × 3 across the other two axes, 2 deep inward (on a piece: only that piece's voxels). It goes into `Game3D.soaks`; `updateSoaks` bites each voxel by strength / `soakFrames` every frame and removes what is left after `soakFrames` (points to the owner).
- **Boosters:** the last `boosters` units. They don't eat (like support ships: `passive`) and fly with the swarm. Every frame on the host `Swarm3D.updateBoost` (`swarm/fields.js`) sets `boosted[i]` for each ship of the swarm within `booster.radius` of one of its boosters (once, however many fields). `Player.boostOf(i)` is then `booster.boost` (1.2) or 1: `biteCell` takes it for the crater radius and the damage, `stormCell` for both, `pierceCell` / `pierceLine` for the damage, drills for the radius. The field is drawn on the host and the guests alike (`renderFields`): one sphere mesh per booster with a shader — the sphere is split as a cube blown up to a ball (equal angles), each side `cells` × `cells` octagons with small squares between, the lines, a shimmer per cell and a rim glow, additive and turning slowly.
- **Cutters:** the next `cutters` units after the boosters. Landed at their bite (`cutter.reach`), they lock the line from the ship through it (`cutDir`) and a side axis across it, along the surface (`cutSide`: across the line and the way out from the centre), `cutOn` = 1. Every frame `world.cutLine` → `Game3D.cutLine` (`destruction.js`): the first solid voxel on the line, and through it the row along the side axis both ways — every solid voxel of the same body (a belt: the same rock, `tags`), over gaps (at most `maxHalf` each);  on a drifting piece (`cutPiece[i]` = its id) `Game3D.cutPiece` takes the piece's voxels in the sheet's slab (half a voxel each side of the plane of the line and the side axis), the ones nearest the ship along the line, all bitten for `damage` × an eater's rate (`boostOf` too); `cutL` / `cutR` = the row's ends. No voxel left on the line (on a belt: of the rock it started on, `cutBody`): through — the row's ends are pushed `farLength` out along the line and for `afterFrames` (`cutAfter`) the sheet shines on, then `cutOn` = 0. Guests get `cutList()` in the snapshot.
- **Ship types in one list:** `SHIP_KINDS` in `config.js` is the order of the types in the swarm (`lasers`, `storms`, `tugs`, `bombers`, `orbs`, `supports`, `cleaners`, `drills`, `piercers`, `snipers`, `splashers`, `boosters`, `cutters`; the rest eat). Each key is a `Player` setting, a `Swarm3D` count and a Ship types slider; its `CONFIG.swarm` entry is the key without the last letter (`kindConfig`: `cleaners` → `cleaner`, with `count` and `color`). `Swarm3D.kindStart(kind)` / `isKind(i, kind)` find a type's units; `Player.splitKinds` fills them in order. A new type: add its key there (and its config entry), then its behaviour; the snapshot carries one u16 per type.
- **Colours:** by ship type for every player (`eaterColor`, then each type's `color`).
- **Giving up on a bite:** a unit with a bite that hasn't eaten for `retarget.frames` (600 = 10 s) stops for `retarget.pauseFrames` (30 = 0.5 s), then `retarget()` picks another free bite while still holding the old one (so the old one isn't picked again); with no other, it keeps the old one.
- **Getting unstuck:** no progress for `stuck.frames` while touching a wall → bite through the blocking voxel (if unclaimed) or turn in a random direction.

## The planet (`VoxelPlanet`)

- Voxels in the level's shape (`shapes.js`): a full-size sphere (Earth, radius 24 / voxel 0.5) has ≈ 463 000 voxels, the Kuiper Belt ≈ 11 000 (335 rocks in a grid of ≈ 2.7 million cells), the test cube ≈ 314 000. Colours come from 3D noise on the sphere (`terrainColor`) for the outer `terrainDepth`, rock below (the text: a colour per letter).
- Only **exposed** voxels (with an empty neighbour) are instances of the `InstancedMesh`; when a voxel is eaten, its hidden neighbours are added. This keeps tens of thousands of instances instead of hundreds of thousands.
- **Pieces that come loose** (`Fragments.js`). Every eaten voxel is noted; once per frame the eaten voxels are grouped into connected clusters, and for each cluster the solid voxels next to it — which were all one body through it — get one flood fill each, run in turns, one voxel at a time. Fills that meet merge. As soon as at most one fill is still growing, every fill that ran out is a closed part smaller than the rest and comes loose; if all of them ran out, the biggest stays, and so do parts of equal biggest size. The work is capped at `fragments.maxSteps` voxels (then no split is found). A loose part's voxels leave the static grid (`hp` 0 there, so collisions, the surface and instancing ignore them; `left` doesn't change — coming loose is not eating) and keep their indices: their strength lives in the fragment's own small grid, drawn by its own `PlanetSurface` (one chunk). A fragment has a position, rotation, velocity and spin; a voxel's place is position + rotation × (its grid centre − the fragment's original centre). `cellCenter`, `solid`, `bite`, `biteSphere`, `remove`, `exposedNear`, `nearestFree` and `findMatter` all know about fragment voxels, so the swarm claims, chases, lands on and eats them like any other; `fragments.at(p)` lets collisions stop units at a fragment (through a spatial hash of 8-unit cells). A unit landed on a drifting bite moves with it. Voxels eaten off a fragment are checked the same way in the fragment's own grid (`splitFragment`); a part that comes loose becomes a new fragment (its voxels move over from the parent, not eaten) that starts where it was in the parent, with the parent's velocity at that point (incl. the turn), a small push away, and a slightly different spin. `origin` (where it came off) limits its drift to `maxDistance`.
- `seed` makes the planet reproducible. `log` collects eaten voxels for the network; `eatenRuns()` / `applyEatenRuns()` transfer the eaten voxels to a guest who joins mid-planet (run lengths over the grid — small even for large grids).

## Roles

- **solo** — everything above runs locally; one player.
- **host** — the same, with up to 3 more players whose commands and settings arrive over the network, plus snapshots sent out.
- **guest** — no simulation: builds the planet from the host's seed, removes the voxels the host reports (emitting debris locally), makes the pieces the host sends and moves them with the same physics (corrected from the host), shows swarm positions from snapshots (eased towards them every frame), sends clicks, recall, settings, Start / Not ready, Next planet and upgrade purchases. See `docs/MULTIPLAYER.md`.

## Performance

Where the time goes, measured in headless Chromium (software WebGL, so drawing is far slower than on a real GPU) on planet 2 with Speed 0.2 and Power 1.5 (measured with up to 1500 units, before swarms were limited to 100 in 0.26.0):

| Units | Simulation per frame | Biggest parts |
| --- | --- | --- |
| 20 | ≈ 3.5 ms | rebuilding the smooth surface (up to `budgetMs` = 3 ms, see below) |
| 300 | ≈ 7 ms | surface 3–4 ms, swarm 2 ms, pieces 1–2 ms |
| 1500 | ≈ 16 ms | surface (planet and pieces), swarm ≈ 2 ms of its own, bites (`biteSphere`), finding food, pieces (≈ 250) |

- **The smooth surface** is the biggest cost while a lot is eaten: every bite marks 16³ chunks dirty and `PlanetSurface.sync` rebuilds them for up to `budgetMs` per frame (the rest waits for the next frames), so the frame time stays bounded and a faster builder shows changes sooner rather than saving time. Each drifting piece has its own small surface, rebuilt when it is bitten.
- **Black holes** draw the scene twice (into a render target, then the lensing pass) while one is open.
- **Simple things to keep:** no allocation in per-unit loops (scratch vectors at module level or on the object), typed arrays for per-unit state, one shared texture for effects that come in many copies (`textures.js`, warp streaks, tractor beams).
- **Measuring:** a CPU profile of `game.update()` through Playwright's CDP session (`Profiler.start` / `Profiler.stop`, self time per function) shows the hot functions; wrapping methods with `performance.now()` gives per-part times per frame.
