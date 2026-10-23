# Configuration (`js/config.js`)

Almost every tunable value is in `js/config.js` (upgrade costs and the lightning's base values are in `js/core/SkillTree.js` — see the last sections). Units: 1 = one unit of the 3D world (a voxel is `planet.voxelSize` = 0.5); speeds and times are **per frame** (about 60 frames per second).

The ship values can also be planned in the **ship editor** (`tools/ship-editor.html`): it shows `swarm` and every ship type with the values here, and exports the changes as JSON (each with its path, e.g. `swarm.cutter.reach`, and the old and new value) to be applied to this file.

## Camera

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `camera.distance` | 75 | starting distance from the planet centre | further / closer |
| `camera.minDistance`, `maxDistance` | 35, 160 | zoom limits | |
| `camera.rotateSpeed` | 0.006 | rotation per dragged pixel (× the player's *Camera turning* setting) | faster / slower drag |
| `camera.zoomSpeed` | 0.08 | zoom per wheel step (× the player's *Zoom speed* setting) | |
| `fov` | 50 | field of view (degrees; widened on portrait screens) | |

## Planet

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `planet.radius` | 24 | planet radius | bigger planet, cubic growth in voxels and memory |
| `planet.voxelSize` | 0.5 | voxel edge | smaller = smoother sphere but many more voxels (halving it = 8×) |
| `planet.terrainDepth` | 1.6 | thickness of the coloured surface layer; rock below | |
| `planet.spinSpeed` | 0 | rotation in radians per frame, shown by turning the camera, sky and tunnels (off since 0.37.0: it looked like the camera turning by itself; 0.0005 = one turn in ≈ 3.5 min) | 0 = no spin |
| `planet.strength` | 1 | a voxel's strength; eating takes `strength / eatFrames` per frame, lightning drains a share of it | (planned: harder voxels later) |
| `planet.rock`, `planet.rockCore` | | rock colours below the surface (outer → core) | |
| `planet.light` | | direction of the sun | |
| `planet.sphereShading` | 0.7 | 0 = flat cube faces, 1 = smooth sphere lighting | |
| `planet.surface` | | terrain noise (`noiseScale`, `octaves`), `seaLevel`, polar ice (`iceLatitude`), `clouds`, colour `palette` | |

## Swarm brain (`leader`)

The point the flock heads for.

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `maxSpeed` | 0.12 | top speed of the target point | faster travel to a click |
| `steer`, `brake`, `slowRadius` | 0.02, 0.9, 6 | how fast the target accelerates, damping of its speed, distance at which it starts slowing down | |
| `arriveRadius` | 1.2 | distance at which a click target counts as reached | |
| `dwellFrames` | 90 | frames it stays at a clicked point before acting on its own | longer obedience to clicks |
| `feedSenseRadius` | 10 | units pick their bites within this radius of the target; the target moves on when nothing free is left in it | larger = the swarm spreads wider while eating |
| `searchSamples` | 600 | random voxels checked when looking for new matter | more = better choice, slower |

## Levels (`levels`)

The missions that can be played, in the solar system map's order (`js/solar.js`): single player picks one on the map; multiplayer goes through them in order (planet 1 the first, then round again). Default: the Kuiper Belt, Pluto, Charon, Neptune, Triton and Earth.

| Field | What it does |
| --- | --- |
| `body` | the map body this mission is (`kuiper`, `pluto`, `charon`, `neptune`, `triton`, `earth`, …) |
| `shape` | `sphere` (default), `belt` (a long band of small asteroids, see below), `cube` (half-edge = radius), `pair` (a sphere and a cube of `radius`, `gap` voxels apart), `boxes` (every box shape up to `max`×`max`×`max` once, `gap` apart) or `text` (voxel letters) |
| `gap` | `pair`: voxels between the sphere and the cube (10); `boxes`: between boxes and rows (5) |
| `max` | `boxes` only: the largest edge (4) |
| `radiusScale` | radius (sphere) or half-edge (cube) = `radiusScale × planet.radius` (0.7 = 30% smaller; voxel count grows with the cube of it). A sphere bigger than Earth moves every tunnel and the camera (its distance and zoom limits) out by the same factor (`Game3D.fitToPlanet`) |
| `text`, `pixel`, `depth`, `colors` | text only: the words (letters T, E, S, L, V and space so far), voxels per font pixel, thickness in voxels, letter colours in turn |
| `count`, `minSize`, `maxSize` | `belt`: how many rocks (335) and how big, voxels across (2–6) |
| `pitch`, `view` | `belt`: the band tipped back −1 rad; single player starts with the camera turned 0.35 rad round (any level may have `view`) |
| `width`, `length`, `curve`, `thick` | `belt`: the band 0.95 × `planet.radius` wide and 9.5 × long (five times its width ×2), its middle 0.06 × its length nearer the camera than its ends, 6 voxels deep |
| `colors` | `belt`: rock colours in turn (icy greys), each a little lighter or darker |
| `surface`, `rock`, `rockCore` | a sphere's own look: anything of `planet.surface` (`seaLevel`, `iceLatitude`, `clouds`, `palette` colours — only what differs), and the inside's colours; the rest comes from `planet`. Charon: ice below `seaLevel` (the "ocean" colours), darker grey rock above it, no clouds (`clouds.threshold` 2), no polar caps (`iceLatitude` 2) |
| `style` | graphics only: `smooth` (smooth surface, cubes hidden), `cubes` or `wedges` (cubes + ramps and corners in the steps) |

Default (all `smooth`): the Kuiper Belt (a band of 335 rocks), Pluto (sphere 0.75; light grey rock, polar caps), Charon (sphere 0.375 — half of Pluto's 0.75; icy, darker grey rock), Neptune (sphere 2 — really 3.9, too many voxels; light blue; 3.7 million voxels, building it takes about a second), Triton (sphere 0.85 — Pluto × 1.14, as in reality; like Pluto, a cooler grey), Earth (sphere 1). The other shapes (`cube`, `pair`, `boxes`, `text`) are no longer missions; the tests build them.

## Test board (`testBoard`)

Dev tools → Test board: `shape: 'balls'` — `count` (4) balls `size` (10) voxels across, `gap` (6) apart in a square, each in its own colour from `colors` (rock, water, iron, lava: the voxel editor's kinds, only their colours so far); `style` like a level; `sizeScale` (0.4): the tunnels and the camera × this (it is small); `each` (2) ships of every type, eaters too. Eaten, it is built again at once; nothing is saved.

## Flock (`swarm`)

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `count` | 3 | ships at the start (`START_UNITS`: 3 eaters); more are bought on the ship bar | |
| `maxCount` | 100 | most units a swarm can have (bought + Brood bonuses together; the ship bar's + is off at 100) | |
| `speed` | 0.05 | identical constant speed of every unit (Wings upgrades add to it) | |
| `perception` | 3 | how far a unit sees neighbours (at least 1.3 × `separationDistance`) | larger = smoother flock, slower |
| `separationDistance` | 1.5 | distance below which units push each other away | |
| `turnRate` | 0.07 | how sharply a unit can change direction per frame | higher = twitchier, lower = wide arcs, may miss targets |
| `turnSmoothing` | 0.12 | how quickly a ship turns its nose to its flying direction; a landed ship eats only once its nose faces its bite | lower = slower turning, a longer wait before each bite |
| `aimAngle` | 12 | a ship eats (a laser ship fires) only when its nose is within this many degrees of its bite | |
| `weights.separation` | 1.8 | keep your distance | |
| `weights.alignment` | 1.0 | fly like your neighbours | |
| `weights.cohesion` | 1 | stay with the group (while flying without a bite) | |
| `weights.target` | 1.1 | pull towards the swarm target | |
| `weights.feed` | 3.0 | pull towards your own bite while eating | lower = units drift off their bites |
| `avoid.minDistance` | 6 | trips shorter than this go straight | |
| `avoid.dipMargin` | 3 | a straight path counts as going through the planet only when it dips this much deeper than both its ends and the surface; then the unit goes around | lower = goes around more often (also for dives into craters) |
| `avoid.altitude` | 3 | height over the surface for trips around the planet | |
| `avoid.pitDepth` | 0.5 | how deep under the surface counts as "in a pit" (climb out first) | |
| `stuck.frames` | 45 | frames without progress before a unit counts as stuck | lower = unsticks sooner, more random turns |
| `stuck.progress` | 0.3 | minimal distance gained in that time | |
| `stuck.recentContact` | 10 | the unit must have touched a wall this recently | |
| `reachDistance` | 0.8 | a unit within `reachDistance` + its speed of its bite lands on it | lower = scraps get circled longer |
| `landSwapDistance` | 1.5 | it may land on a free voxel this close to its bite instead (nearest mode) | |
| `eatFrames` | 25 | frames a unit sits on its bite before eating it | lower = faster eating |
| `count`, `laser.count`, `storm.count`, `tug.count`, `bomber.count`, `orb.count`, `support.count`, `cleaner.count`, `drill.count`, `piercer.count`, `sniper.count`, `splasher.count`, `booster.count`, `cutter.count` | 3, 0 each | units at the start and how many of each type — `START_EACH` (0) of every type; `count` = `START_UNITS` (3, all eaters) | |
| `bomber.radius` | 5 | a bomber destroys everything within this (10 voxels) | |
| `bomber.color`, `bomber.debris` | purple, 300 | colour; most debris pieces thrown by a blast | |
| `orb.range`, `orb.speed`, `orb.blast` | 5, 0.045, 1 | firing distance (10 voxels), orb speed per frame, burst radius (2 voxels) | |
| `orb.color`, `orb.glowColor`, `orb.glowSize`, `orb.pulse` | magenta | orb ship and orb colours, glow size (× voxel) and pulse speed | |
| `orb.tailPerFrame`, `orb.tailFrames`, `orb.tailSize`, `orb.tailJitter` | 3, 22, 1.6, 0.12 | the fiery tail: sparks per frame, how long they live, size, spread | |
| `support.every`, `support.jumps`, `support.jumpRange` | 180, 6, 10 | a bolt every 3 s per support ship; most jumps; how far a jump reaches | |
| `support.life`, `support.fadeOut` | 90, 25 | the bolt runs for 1.5 s (its last frames fading) | |
| `support.bend`, `support.jag`, `support.points` | 0.09, 0.025, 24 | how much each jump bends (× its length), small jitter, points per jump | |
| `support.glowPx`, `support.branchGlowPx`, `support.branches`, `support.branchLength` | 4, 2, 3, 1.6 | glow widths; branches per jump and their length | |
| `support.flowWaves`, `support.flowSpeed` | 3, 0.05 | energy pulses per jump and how fast they run | |
| `cleaner.count`, `cleaner.maxPiece`, `cleaner.color` | 2, 3, grey | cleaners at the start; the biggest drifting piece (in voxels) they eat; colour | bigger `maxPiece` = they take bigger pieces too |
| `drill.count`, `drill.color` | 2, orange | drills at the start; ship colour | |
| `drill.speed`, `drill.power`, `drill.maxLength`, `drill.emptyFrames` | 0.08, 0.75, 60, 25 | drilling speed per frame; everything within `power` × the player's Power of the bit is gone (0.375 at the default Power 0.5, about 0.75 voxels); longest tunnel; frames in empty space after the last voxel before it stops | bigger `power` = wider tunnels |
| `drill.spread`, `drill.debris` | 0.35, 4 | how far off the centre the direction may be (random); debris per frame | |
| `drill.bitColor`, `drill.bitDark`, `drill.bitLength`, `drill.bitRadius`, `drill.bitSpin` | orange, dark brown, 0.6, 0.16, 0.6 | the spiral bit: colours of the spiral, size, turn per frame (radians) | |
| `piercer.count`, `piercer.color` | 2, copper | piercers at the start; hull colour | |
| `piercer.reach`, `piercer.pierce`, `piercer.damage` | 10, 3, 0.8 | firing distance (20 voxels); voxels in a row the beam goes through (claimed or not); each eaten at this × an eater's rate | more `pierce` = deeper shots |
| `piercer.afterFrames`, `piercer.farLength`, `piercer.spiralMaxLength` | 120, 400, 90 | frames it keeps firing once through (2 s), the beam then going this far on into space; the spiral round it at most this long | |
| `piercer.width`, `piercer.hitSize`, `piercer.beamColors`, `piercer.hitColors` | 0.4, 1.2, orange | the beam (as for lasers) |
| `piercer.spiralColor`, `spiralRadius`, `spiralTurns`, `spiralPoints` | yellow, 0.22, 0.64, 10 | the lightning round the beam: radius, turns per unit (0.64: about one turn per 1.5 units), points per turn |
| `piercer.flashEvery`, `flashFrames`, `glowPx` | 3, 5, 4 | a new spiral every 3 frames, lasting 5; glow 4 px (like the support ships' bolt) |
| `sniper.count`, `sniper.color` | 2, teal | snipers at the start; hull colour | |
| `sniper.chargeFrames`, `sniper.moveFrames` | 300, 60 | it stops and charges 5 s before each shot; after a shot it flies on for 1 s | |
| `sniper.speed`, `sniper.accel` | 0.05, 1.05 | the shot's speed at the start (units per frame); × this for every voxel flown | |
| `sniper.shotSize`, `shotColor` | 0.07 × 0.07 × 0.5, white-cyan | the shot (a thin streak, a little smaller than an eater) | |
| `sniper.shockRadius`, `shockLength`, `shockColor`, `shockCore`, `wake` | 0.14, 0.45, orange, near white, 0.6 | the rounded glowing bow round the front, swept back `shockLength` (both grow with the speed); the wake behind (× the speed-up) | |
| `sniper.flashFrames`, `flashSize` | 10, 1.6 | the flash at the hit | |
| `splasher.count`, `splasher.color` | 2, blue | splashers at the start; hull colour | |
| `splasher.range`, `splasher.speed` | 5, 0.07 | firing distance (10 voxels); bubble speed per frame | |
| `splasher.size`, `splasher.wobble` | 1.5, 0.08 | the bubble's diameter (3 voxels); how fast its edge wobbles | |
| `splasher.soakFrames`, `splasher.area` | 180, [3, 3, 2] | how long the block soaks before it is gone (3 s); the block: 3 × 3 across the surface, 2 deep | |
| `splasher.splash`, `splasher.splashColor` | 10, light blue | debris per voxel at the landing and as voxels go; its colour | |
| `booster.count`, `booster.color` | 2, pink | boosters at the start; hull colour | |
| `booster.radius`, `booster.boost` | 1.25, 1.2 | the field's radius (5 voxels across); × the Power inside it (crater radius and how hard ships eat; fields don't add up) | |
| `booster.fieldColors`, `booster.cells`, `booster.line` | deep / light pink, 3, 0.05 | the field's colours; octagons along each of the six sides of the ball; line width (part of a cell) | |
| `booster.opacity`, `booster.fill`, `booster.rim`, `booster.spin`, `booster.segments` | 0.7, 0.07, 0.5, 0.004, 32 | how bright the field is, the cells' faint fill, the glowing rim; turning per frame; sphere detail | |
| `cutter.count`, `cutter.color` | 2, crimson | cutters at the start; hull colour | |
| `cutter.reach`, `cutter.damage`, `cutter.maxHalf` | 10, 0.8, 12 | cutting distance (20 voxels); each voxel of the row bitten at this × an eater's rate (as a piercer); the row at most this many voxels each side of the line | |
| `cutter.afterFrames`, `cutter.farLength` | 60, 400 | once through, the sheet shines on this long (1 s), its far end this far into space | |
| `cutter.sheetColor`, `edgeColor`, `apex`, `hazeSpeed`, `opacity` | red, light red, 0.12, 1, 0.85 | the sheet's haze and its edge rays; half its width at the ship; how fast the haze drifts; brightness | |
| `minCount` | 0 | fewest units (bombers that blew up can take the swarm down to nothing) | |
| `groupArrive` | 3 | a group sent to a point (ship bar + click) got there once one of its ships is this close or has landed; after `leader.dwellFrames` it carries on as usual (its next bites still near the point) | |
| `tug.range` | 5 | a tug's tractor beam reach (10 voxels) from the piece's edge; it lets go beyond 1.6 × this | |
| `tug.pull` | 0.9 | a towed piece's speed × the swarm speed | |
| `tug.deliver` | 2 | how close (beyond the piece's radius) to the tunnel a piece counts as home | |
| `tug.reward` | 5 | points per voxel of a piece brought home | |
| `tug.color`, `tug.beamColor`, `tug.streaks` | green, 14 | tug and beam colour, light streaks in the beam | |
| `tug.outlineScale`, `tug.outlinePoints`, `tug.rimMax` | 1.05, 160, 64 | the beam ends on the piece's outline this much larger; voxels sampled for it; most outline points | |
| `eaterColor` | yellow | eaters' colour (every player); `color` stays the swarm's colour in single player (click marker) | |
| `storm.centre`, `storm.side` | 0.4, 0.3 | a storm ship's damage on its bite / on each of the two nearest voxels, as a share of what a laser does (its whole crater) | |
| `storm.fork` | 0.7 | where the bolt forks (share of the way to the bite) | |
| `storm.color`, `storm.boltColor` | blue | storm ship and lightning colour | |
| `storm.flashEvery`, `storm.flashFrames`, `storm.sideGlow` | 4, 6, 0.6 | a new flash every 4 frames, 6 frames long; side bolts at 60% brightness | |
| `laser.reach` | 2.5 | how far from its bite a laser ship eats (5 voxels of 0.5) | |
| `laser.speedFactor` | 0.9 | laser ships' speed × the swarm speed | |
| `laser.color` | red | laser ship colour | |
| `laser.width`, `laser.hitSize` | 0.5, 1.4 | width of the glowing beam, size of the glow where it hits | |
| `retarget.frames`, `retarget.pauseFrames` | 600, 30 | a unit with a bite that has not eaten for 10 s stops for 0.5 s, then takes another bite (the same one if there is no other) | lower = gives up sooner |
| `biteRadius` | 0.5 | Power — crater radius per bite (Jaws upgrades add to it) | |
| `spawnSpread` | 4 | size of the cloud new units appear in | |
| `spawnGap` | 1 | spawn distance from the surface, in planet radii | |
| `color`, `size` | | `color` is unused (swarm colours come from `PLAYERS` in `js/three/game/players.js`); `size` — unit box size | |

## Spawn tunnel (`portal`)

| Value | Default | What it does |
| --- | --- | --- |
| `closedRadius`, `openRadius` | 0.7, 4 | mouth radius closed (the small swirl) and open |
| `openFrames`, `closeFrames` | 50, 60 | how long opening and closing take |
| `emergeWindow` | 90 | ships come out at random moments within this many frames (1.5 s) |
| `linger` | 40 | the tunnel closes this long after the last ship is out |
| `pulseFrames` | 90 | how long it stays open to take in a towed piece |
| `hitRadius` | 2.5 | how close to the tunnel a click must be (plus part of its radius) |
| `narrowing`, `narrowFrames` | 10, 30 | while the tunnel opens it is this many degrees narrower (deeper); once open it widens back to its usual shape over `narrowFrames` |
| `flare` | 2.2 | the bell at the wide end: the radius grows as (distance along)^`flare` — 1 = a straight cone, more = narrow longer, opening out at the end like a trumpet |
| `streaks` | 35 | light streaks in the texture, bunched around 5 random places |
| `fadeEnd` | 0.2 | the last 20% of the streaks (at the wide end) fade out to transparent |
| `color`, `innerColor`, `rimColor`, `coreColor` | blues | the three streak layers and the bright core |

## Jump to hyperspace (`swarm.warp`)

| Value | Default | What it does |
| --- | --- | --- |
| `window` | 150 | every ship jumps at a random moment within this many frames (2.5 s) |
| `frames` | 40 | how long a jump lasts before the ship is gone |
| `accel`, `maxSpeed` | 1.16, 4 | speed × `accel` every frame, up to `maxSpeed` units per frame |
| `outward` | 0.8 | how much the jump direction leans away from the planet (the rest: the ship's heading) |
| `trailFade` | 25 | frames the streak stays after the ship is gone |
| `width`, `color`, `streakColor`, `streaks` | 0.35, blue, light blue, 6 | the streak: a blue band with lighter lines along it |

## Next planet (`beacon`)

| Value | Default | What it does |
| --- | --- | --- |
| `returnTimeoutFrames` | 1500 | the next planet appears after this even if a ship hasn't jumped yet |

## Multiplayer (`net`)

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `idPrefix` | `hive-hunger-` | PeerJS id = prefix + room code (change to separate test rooms) | |
| `codeLength` | 6 | room code length | |
| `snapshotEvery` | 4 | frames between updates to guests (≈ 15/s) | lower = smoother guests, more data |
| `maxBuffered` | 1 MB | skip an update while this much waits to be sent | |
| `follow` | 0.35 | how fast guests' units move towards the host's positions | higher = snappier, jerkier |
| `pingMs` | 2000 | ping, stats and "still here" interval | |
| `timeoutMs` | 10000 | silence after which a player counts as **connection lost** | lower = faster detection, more false drops |
| `noticeMs` | 6000 | how long joined / left / lost notices stay in the HUD | |

## Pieces bitten off (`fragments`)

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `drift` | 0.01 | starting speed of a piece, away from the planet's centre (plus a little sideways), units per frame | higher = flies off faster |
| `damping` | 0.997 | drift speed kept each frame; a piece stops after about `drift / (1 − damping)` ≈ 3.3 units | 1 = never stops |
| `spin` | 0.006 | turn per frame, radians (each piece 0.5–1.5 × this, about a random axis) | |
| `spinDamping` | 1 | turn kept each frame | 1 = keeps turning |
| `maxRimSpeed` | 0.025 | a piece's edge moves at most this fast (half the default drone speed): big pieces get a slower turn | higher = big pieces turn faster, harder to catch |
| `maxDistance` | 4 | a piece stops this far from where it came off (keeps turning) | |
| `maxSteps` | 400000 | flood-fill limit when looking for a split per eaten cluster; above it no split is found | lower = cheaper, huge halves don't come loose |
| `syncEvery` | 30 | frames between piece positions sent to guests | |
| `towSyncEvery` | 6 | … while a piece is being towed | |

## Black holes (`holes`)

| Value | Default | What it does |
| --- | --- | --- |
| `grow`, `hold`, `shrink` | 60, 120, 60 | frames growing (1 s), at full size (2 s), shrinking (1 s) |
| `size` | 2.2 | Einstein radius at full size (how far around it the picture bends) |
| `range` | 7.5 | pull range (15 voxels) |
| `pullDebris`, `pullPieces`, `maxPieceSpeed` | 0.004, 0.0015, 0.05 | how hard it pulls debris / pieces per frame, fastest a pulled piece moves |
| `core` | 0.9 | debris within this is gone, a piece is swallowed |
| `ringColor` | light purple | the thin ring around the black disc |

## Other

- `background` — scene background colour behind the sky.
- `space` — sky: nebula texture, colours and star layers.
- `marker` — the ring shown at a click (`lifeFrames`, `pulseSpeed`, `lift` above the surface).
- `debris` — eaten-voxel particles: `max` count, speeds, `friction`, `fade`, `size`.

## Upgrades and lightning (`js/core/SkillTree.js`)

Every node is bought once and needs a parent (`parents`: any one of them, or every one with `all`); effects add up on top of the base values. Nodes have a `kind` — `swarm` (diamond), `ship` (hexagon), `prop` (a ship's property, circle) — and a level `depth` 0–5. The ships, their properties, Agility and Swarm sense are `soon` (shown, not for sale yet: their logic comes later). What can be bought:

| Branch | Nodes | Costs (points) | Effect per node |
| --- | --- | --- | --- |
| Brood | I–III | 40, 90, 180 | +10 units |
| Wings | I–II | 40, 90 | +10% speed |
| Jaws | I–III | 40, 90, 180 | +0.2 bite radius |
| Chain lightning | 1 | 250 | unlocks the bolt |
| Arcs → Voltage → Capacitor | one each, in a chain | 150, 300, 600 | +2 jumps; +0.15 strength drained per voxel; a bolt 1 s more often |

`BOLT_BASE` — the bolt before upgrades: every 6 s, 4 jumps, drains 0.25 of a voxel's strength (never below 5%), jumps up to 9 units between drones.

## Other constants outside `config.js`

- `js/three/planet/PlanetSurface.js`: `CHUNK = 16` (voxels per chunk edge of the smooth / wedge surfaces), `budgetMs = 3` (time per frame for rebuilding changed chunks; at least one is rebuilt).
- `js/three/planet/Fragments.js`: `HASH = 8` (cell size of the spatial hash used to find drifting pieces near a unit).
- `js/three/effects/Lightning3D.js`: `life = 20` (frames a bolt stays visible), `jag` (how jagged it is), `pieces` (kinks per jump).

## Player settings (`js/settings.js`)

Not game rules: each player's own, remembered in the browser (`localStorage`, key `hive-hunger-settings`), never sent over the network. Changed in the Settings menu.

| Setting | Default | What it does |
| --- | --- | --- |
| `rotateSpeed` | 1 | camera turning, × `camera.rotateSpeed` (0.25–3) |
| `zoomSpeed` | 1 | wheel zoom, × `camera.zoomSpeed` (0.25–3) |
| `fps` | off | FPS counter at the bottom right |
| `resolution` | native | render pixels per CSS pixel: 0.5, 0.75, 1 or the screen's (at most 2) |
| `antialias` | on | smooth edges (a new renderer is made when it changes) |
| `effects` | high | debris and orb sparks: high × 1, medium × 0.5, low × 0.2 (`EFFECTS_SCALE`) |

## Ship groups (`SHIP_GROUPS` in `config.js`)

How the types are shown in the ship bar and the Ship guide: `Attack` (eaters, lasers, storms, orbs, splashers, bombers, drills, piercers, cutters, snipers), then below a line `Support` (tugs, support, cleaners, boosters). Only for showing — the order of the units in the swarm is `SHIP_KINDS`.
