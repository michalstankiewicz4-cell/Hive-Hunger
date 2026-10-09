# Configuration (`js/config.js`)

Every tunable value is in `js/config.js`. Units: 1 = one unit of the 3D world (a voxel is `planet.voxelSize` = 0.5); speeds and times are **per frame** (about 60 frames per second). Values marked *slider* are the defaults of the settings panel — players change them live.

## Camera

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `camera.distance` | 75 | starting distance from the planet centre | further / closer |
| `camera.minDistance`, `maxDistance` | 35, 160 | zoom limits | |
| `camera.rotateSpeed` | 0.006 | rotation per dragged pixel | faster / slower drag |
| `camera.zoomSpeed` | 0.08 | zoom per wheel step | |
| `fov` | 50 | field of view (degrees; widened on portrait screens) | |

## Planet

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `planet.radius` | 24 | planet radius | bigger planet, cubic growth in voxels and memory |
| `planet.voxelSize` | 0.5 | voxel edge | smaller = smoother sphere but many more voxels (halving it = 8×) |
| `planet.terrainDepth` | 1.6 | thickness of the coloured surface layer; rock below | |
| `planet.spinSpeed` | 0.0005 | rotation in radians per frame (one turn ≈ 3.5 min) | 0 = no spin |
| `planet.sphereShading` | 0.7 | 0 = flat cube faces, 1 = smooth sphere lighting | |
| `planet.atmosphere` | | glow ring: colour, size (`scale`), sharpness (`power`), `intensity` | |
| `planet.surface` | | terrain noise (`noiseScale`, `octaves`), `seaLevel`, polar ice (`iceLatitude`), `clouds`, colour `palette` | |

## Swarm brain (`leader`)

The point the flock heads for.

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `maxSpeed` | 0.12 | top speed of the target point | faster travel to a click |
| `arriveRadius` | 1.2 | distance at which a click target counts as reached | |
| `dwellFrames` | 90 | frames it stays at a clicked point before acting on its own | longer obedience to clicks |
| `feedSenseRadius` | 10 | units pick their bites within this radius of the target; the target moves on when nothing free is left in it | larger = the swarm spreads wider while eating |
| `searchSamples` | 600 | random voxels checked when looking for new matter | more = better choice, slower |

## Levels (`levels`)

A cycle of planets: planet 1 uses the first entry, planet 5 the first again.

| Field | What it does |
| --- | --- |
| `radiusScale` | planet radius = `radiusScale × planet.radius` (0.7 = 30% smaller; voxel count grows with the cube of it) |
| `style` | graphics only: `cubes`, `smooth` (smooth surface, cubes hidden) or `wedges` (cubes + ramps and corners in the steps) |

Default: `0.7 cubes`, `1 cubes`, `1 smooth`, `1 wedges`.

## Flock (`swarm`)

| Value | Default | What it does | More / less |
| --- | --- | --- | --- |
| `count` | 20 | *slider Units* | |
| `minCount`, `maxCount` | 10, 1500 | limits of the Units slider | |
| `speed` | 0.05 | *slider Speed* — identical constant speed of every unit | |
| `perception` | 3 | how far a unit sees neighbours (at least 1.3 × spacing) | larger = smoother flock, slower |
| `separationDistance` | 1.5 | *slider Spacing* | |
| `turnRate` | 0.07 | how sharply a unit can change direction per frame | higher = twitchier, lower = wide arcs, may miss targets |
| `turnSmoothing` | 0.12 | how quickly the **drawn** heading follows the real one (looks only) | lower = smoother, lazier rotation |
| `weights.separation` | 1.8 | keep your distance | |
| `weights.alignment` | 1.0 | fly like your neighbours | |
| `weights.cohesion` | 1 | *slider Cohesion* — stay with the group | |
| `weights.target` | 1.1 | pull towards the swarm target | |
| `weights.feed` | 3.0 | pull towards your own bite while eating | lower = units drift off their bites |
| `avoid.minDistance` | 6 | trips shorter than this go straight | |
| `avoid.dipMargin` | 3 | a straight path counts as going through the planet only when it dips this much deeper than both its ends and the surface; then the unit goes around | lower = goes around more often (also for dives into craters) |
| `avoid.altitude` | 3 | height over the surface for trips around the planet | |
| `avoid.pitDepth` | 0.5 | how deep under the surface counts as "in a pit" (climb out first) | |
| `stuck.frames` | 45 | frames without progress before a unit counts as stuck | lower = unsticks sooner, more random turns |
| `stuck.progress` | 0.3 | minimal distance gained in that time | |
| `stuck.recentContact` | 10 | the unit must have touched a wall this recently | |
| `reachDistance` | 0.8 | a unit this close to its bite lands on it | lower = scraps get circled longer |
| `landSwapDistance` | 1.5 | it may land on a free voxel this close to its bite instead (nearest mode) | |
| `nearestMode` | true | *toggle Eat nearest block* | |
| `feedFlocking` | 0.35 | how much alignment/cohesion remains while feeding (with Eat nearest block it is 0) | higher = units pull each other off their bites |
| `eatFrames` | 25 | frames a unit sits on its bite before eating it | lower = faster eating |
| `biteRadius` | 0.5 | *slider Power* — crater radius per bite | |
| `spawnSpread` | 4 | size of the cloud new units appear in | |
| `spawnGap` | 1 | spawn distance from the surface, in planet radii | |
| `color`, `size` | | single-player colour, unit box size | |

## Settings panel (`controls`)

Slider ranges and steps (`min`, `max`, `step`, `decimals`) and the toggle. Defaults come from `swarm` above; "Reset to default" restores them.

## Beacon (`beacon`)

| Value | Default | What it does |
| --- | --- | --- |
| `color`, `size` | amber, 0.9 | single-player beacon (in multiplayer it takes the player's colour) |
| `hitRadius` | 3 | how close to the beacon a click must be |
| `arriveRadius`, `gatherRadius` | 2.5, 10 | when a returning swarm counts as home |
| `returnTimeoutFrames` | 1500 | the next planet appears after this even if a swarm isn't home |

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

## Other

- `space` — sky: nebula texture, colours and star layers.
- `marker` — the ring shown at a click (`lifeFrames`, `pulseSpeed`, `lift` above the surface).
- `debris` — eaten-voxel particles: `max` count, speeds, `friction`, `fade`, `size`.
