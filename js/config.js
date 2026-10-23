// All game parameters in one place (1 unit = 1 in the 3D world).
// at the start every player has START_UNITS eaters and START_EACH ships of every other type (laser ships,
// storm ships, tugs, bombers, orb ships, support ships, cleaners, drills, piercers, snipers, splashers,
// boosters, cutters): 3 eaters, nothing else — more are bought on the ship bar
const START_EACH = 0;
const START_UNITS = 3;

/**
 * Ship types other than eaters, in the order their units come in the swarm: units 0 … lasers−1 are
 * laser ships, then storm ships, and so on; the rest are eaters. Each key is also the setting (and
 * the Ship types slider) with how many there are.
 */
export const SHIP_KINDS = ['lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills', 'piercers', 'snipers', 'splashers', 'boosters', 'cutters'];
/**
 * How the ship types are shown (Ship types panel, Ship guide): attack ships, then — below a line —
 * support ships. (The order of the units in the swarm is SHIP_KINDS above; this is only for showing.)
 */
export const SHIP_GROUPS = Object.freeze([
  { name: 'Attack', kinds: ['eaters', 'lasers', 'storms', 'orbs', 'splashers', 'bombers', 'drills', 'piercers', 'cutters', 'snipers'] },
  { name: 'Support', kinds: ['tugs', 'supports', 'cleaners', 'boosters'] },
]);
/**
 * Groups of ships you send (the ship bar): every type in SHIP_KINDS order, eaters last — the index is
 * `Swarm3D.kindOf[i]`.
 */
export const GROUP_KINDS = Object.freeze([...SHIP_KINDS, 'eaters']);
/** The CONFIG.swarm entry of a ship type: 'lasers' → 'laser', 'supports' → 'support', … */
export const kindConfig = (kind) => kind.slice(0, -1);

export const CONFIG = Object.freeze({
  background: 0x0b0c14,
  fov: 50,
  camera: { distance: 75, minDistance: 35, maxDistance: 160, rotateSpeed: 0.006, zoomSpeed: 0.08 },

  // Space background
  space: {
    radius: 1500,
    backgroundRgb: [11, 12, 20],
    nebulaTexture: { width: 512, height: 256 },
    nebula: {
      scale: 1.3,
      octaves: 5,
      threshold: 0.42,   // below this — empty space
      falloff: 1.5,
      intensity: 1.0,
      colors: [[70, 40, 140], [30, 90, 150], [150, 50, 110]],
    },
    stars: {
      layers: [
        { count: 5000, size: 1.2, opacity: 0.8 },
        { count: 500, size: 2.4, opacity: 0.95 },
      ],
    },
  },

  // The swarm's "brain": the point the flock heads for (units per frame)
  leader: {
    maxSpeed: 0.12,
    steer: 0.02,
    brake: 0.9,
    slowRadius: 6,
    arriveRadius: 1.2,
    dwellFrames: 90,   // frames it stays at a clicked point before acting on its own again
    feedSenseRadius: 10, // units pick their bites within this radius of the target; the target moves on when nothing free is left
    searchSamples: 600,
  },

  planet: {
    radius: 24,
    voxelSize: 0.5,        // smaller = smoother sphere, more voxels
    terrainDepth: 1.6,     // thickness of the terrain-coloured layer
    // planet rotation, radians per frame — shown by turning the camera, sky and tunnels round it, so it
    // looked like the camera turning by itself: off (owner, 0.37.0; it was 0.0005, one turn ≈ 3.5 min)
    spinSpeed: 0,
    strength: 1,
    rock: [96, 84, 74],     // interior below the surface (rock)
    rockCore: [58, 50, 46], // darker rock near the core
    light: [-0.55, 0.6, 0.58],
    sphereShading: 0.7,    // 0 = flat cube faces, 1 = smooth sphere

    surface: {
      noiseScale: 2.2,
      octaves: 5,
      seaLevel: 0.5,
      iceLatitude: 0.78,
      clouds: { scale: 3.2, threshold: 0.6, opacity: 0.75 },
      palette: {
        deepOcean:    [14, 42, 92],
        shallowOcean: [34, 96, 158],
        beach:        [200, 186, 130],
        lowland:      [62, 128, 58],
        highland:     [104, 120, 62],
        mountain:     [122, 104, 88],
        snow:         [236, 240, 245],
        ice:          [222, 234, 244],
      },
    },
  },

  // The missions' planets, in the order of the solar system map (js/solar.js: from the outside in);
  // `body` = the map's body. Only these bodies can be played yet — the rest of the map is "coming soon".
  // shape: 'sphere' (default), 'belt' (a long band of small irregular asteroids facing the starting
  // camera: `length` × planet.radius long, `width` × planet.radius across, bent very slightly — its
  // middle `curve` × its length nearer than its ends — `thick` voxels deep, tipped back `pitch` radians; `view` turns the
  // camera that many radians round at the start of the mission (single player) so it is seen at an angle; `count` rocks of `minSize` …
  // `maxSize` voxels across, `colors` per rock) — see shapes.js (cube, pair, boxes and text are there too).
  // radiusScale × planet.radius = the sphere's radius.
  // style = graphics only (physics and eating always use the voxels): 'cubes' — the voxels;
  // 'smooth' — a smooth surface over them; 'wedges' — cubes plus low-poly wedges in the steps.
  // Every level uses 'smooth' (the owner's choice); the other styles stay available.
  // In multiplayer the missions go in this order, one after another (and round again).
  levels: [
    { body: 'kuiper', shape: 'belt', count: 335, minSize: 2, maxSize: 6, width: 0.95, length: 9.5, curve: 0.06, thick: 6, pitch: -1, view: 0.35, style: 'smooth',
      colors: [[176, 190, 214], [150, 160, 180], [200, 206, 218], [130, 136, 150], [186, 176, 168]] },
    // Pluto: 0.75 × Earth's radius — light grey rock (lighter on the plains below `seaLevel`), white polar caps, no clouds
    { body: 'pluto', radiusScale: 0.75, style: 'smooth', rock: [140, 138, 136], rockCore: [100, 98, 96],
      surface: { seaLevel: 0.47, iceLatitude: 0.72, clouds: { threshold: 2 },
        palette: { deepOcean: [200, 200, 204], shallowOcean: [214, 214, 218], beach: [190, 190, 194], lowland: [178, 178, 182],
          highland: [162, 162, 168], mountain: [146, 146, 152], snow: [226, 228, 232], ice: [240, 243, 248] } } },
    // Charon: half of Pluto's size (Pluto: 0.75 × Earth's radius) — icy plains with rock darker grey than
    // Pluto's (`seaLevel` splits ice below from rock above; no clouds, no polar caps)
    { body: 'charon', radiusScale: 0.375, style: 'smooth', rock: [92, 90, 92], rockCore: [62, 60, 62],
      surface: { seaLevel: 0.47, iceLatitude: 2, clouds: { threshold: 2 },
        palette: { deepOcean: [150, 158, 170], shallowOcean: [178, 186, 198], beach: [150, 152, 158], lowland: [118, 118, 124],
          highland: [102, 102, 108], mountain: [84, 84, 90], snow: [196, 202, 212], ice: [210, 218, 228] } } },
    // Neptune: the ice giant, light blue. Really 3.9 × Earth's radius — too many voxels for a browser, so 2 ×
    // (3.7 million voxels, 8 × Earth's); the tunnels and the camera go out with it (Game3D.fitToPlanet).
    // Smooth blues in soft patches (no rock showing, no polar caps, no clouds)
    { body: 'neptune', radiusScale: 2, style: 'smooth', rock: [70, 120, 170], rockCore: [40, 80, 130],
      surface: { seaLevel: 0.2, iceLatitude: 2, noiseScale: 1.4, clouds: { threshold: 2 },
        palette: { deepOcean: [78, 150, 222], shallowOcean: [96, 166, 232], beach: [104, 172, 236], lowland: [110, 178, 238],
          highland: [122, 186, 240], mountain: [134, 194, 242], snow: [150, 204, 246], ice: [150, 204, 246] } } },
    // Triton: like Pluto, a little bigger (really 1353 km to Pluto's 1188: × 1.14 → 0.85 × Earth's radius);
    // grey rock with a slightly cooler tint, polar caps, no clouds
    { body: 'triton', radiusScale: 0.85, style: 'smooth', rock: [136, 138, 142], rockCore: [96, 98, 102],
      surface: { seaLevel: 0.47, iceLatitude: 0.72, clouds: { threshold: 2 },
        palette: { deepOcean: [196, 200, 208], shallowOcean: [210, 214, 222], beach: [186, 190, 196], lowland: [172, 176, 184],
          highland: [156, 160, 168], mountain: [140, 144, 152], snow: [224, 228, 236], ice: [238, 243, 250] } } },
    { body: 'earth', radiusScale: 1, style: 'smooth' },
  ],
  // Dev tools → Test board: this planet again and again (eaten → the ships jump → it is back), `each`
  // ships of every type (eaters too), nothing saved
  testBoard: { body: 'earth', radiusScale: 1, style: 'smooth', each: 2 },

  // Flock (boids). Every unit flies at the same constant speed — only its direction changes.
  swarm: {
    count: START_UNITS,
    minCount: 0,             // (bombers that blew up can take the swarm down to nothing)
    maxCount: 100,           // most ships a swarm can have (Units slider and upgrades together)
    speed: 0.05,             // units per frame, identical for all
    perception: 3,           // how far a unit sees its neighbours
    separationDistance: 1.5, // distance below which units push each other away
    turnRate: 0.07,          // how fast a unit can turn
    turnSmoothing: 0.12,     // how quickly a ship turns its nose to the flying direction (slider Turning; lower = slower, smoother)
    weights: {
      separation: 1.8,       // keep your distance
      alignment: 1.0,        // fly the same way as your neighbours
      cohesion: 1,           // stay with the group
      target: 1.1,           // head for the swarm target
      feed: 3.0,             // head for your own bite (when the swarm is at matter)
    },
    // flying around the planet instead of into it on long trips
    avoid: { minDistance: 6, dipMargin: 3, altitude: 3, pitDepth: 0.5 },
    // getting unstuck: frames without progress, minimal progress, and how recent the wall contact must be
    stuck: { frames: 45, progress: 0.3, recentContact: 10 },
    reachDistance: 0.8,      // a unit this close to its own bite lands on it
    landSwapDistance: 1.5,   // a unit may land on a free voxel this close to its own bite instead
    eatFrames: 25,           // frames a unit sits on its bite before it is eaten
    // ship types: red laser ships eat their bite from `reach` away (5 voxels of 0.5) and fly
    // `speedFactor` × the speed; `count` = how many of the units are lasers at the start
    // The beam is a glowing band `width` wide with a glow of `hitSize` where it hits.
    laser: { count: START_EACH, reach: 2.5, speedFactor: 0.9, color: 0xff4a4a, width: 0.5, hitSize: 1.4 },
    // blue storm ships: from laser range, a bolt that forks at `fork` (70%) of the way into three —
    // `centre` of a laser's damage on the bite, `side` on each of the two nearest voxels; a new
    // flash every `flashEvery` frames, `flashFrames` long; side bolts drawn at `sideGlow` brightness
    storm: { count: START_EACH, centre: 0.4, side: 0.3, fork: 0.7, color: 0x8fd0ff, boltColor: 0x6fbaff, flashEvery: 4, flashFrames: 6, sideGlow: 0.6 },
    // green tugs: fly only to drifting pieces; within `range` (10 voxels) a tractor beam holds the whole
    // piece and they tow it home at `pull` × their speed; at the tunnel (`deliver` units from it) the
    // piece is gone and the player gets `reward` × its points. `streaks` = light streaks in the beam;
    // the beam ends on the piece's outline as seen from the tug, `outlineScale` × its size
    tug: { count: START_EACH, range: 5, pull: 0.9, deliver: 2, reward: 5, color: 0x6dff7a, beamColor: 0x3dff86, streaks: 14,
      outlineScale: 1.05, outlinePoints: 160, rimMax: 64 }, // the beam: the piece's outline 5% larger (from up to 160 of its voxels)
    // purple bombers: fly to the nearest voxel; touching it, they blow up every voxel within `radius`
    // (10 voxels) — a point each — and die for good; `debris` = pieces of debris thrown (at most)
    bomber: { count: START_EACH, radius: 5, color: 0xb36bff, debris: 300 },
    // magenta orb ships: from `range` (10 voxels) fire a voxel-sized plasma orb with a pulsing glow,
    // one at a time; it flies at `speed` and bursts at the target, destroying everything within
    // `blast` (2 voxels)
    orb: { count: START_EACH, range: 5, speed: 0.045, blast: 1, color: 0xff3ed8, glowColor: 0xff5ae6, glowSize: 3.2, pulse: 0.25,
      flashFrames: 14, flashSize: 6, debris: 30,
      // the fiery tail: sparks per frame, frames they live, their size (× voxel), spread
      tailPerFrame: 3, tailFrames: 22, tailSize: 1.6, tailJitter: 0.12, tailMax: 4000 },
    // white support ships: don't eat; every `every` frames each fires a lightning bolt that jumps up
    // to `jumps` times between ships of its swarm (random, each within `jumpRange` of the last) and
    // destroys every voxel on its way. The bolt lives `life` frames (1.5 s): a white core with a
    // `glowPx` glow and energy flowing along it, bent (`bend`, `jag`), with `branches` forked side
    // bolts per jump (`branchGlowPx` glow) that do nothing
    support: { count: START_EACH, every: 180, jumps: 6, jumpRange: 10, color: 0xffffff, glowColor: 0xdfe8ff,
      life: 90, fadeOut: 25, points: 24, bend: 0.09, jag: 0.025, glowPx: 4, branchGlowPx: 2,
      branches: 3, branchLength: 1.6, branchBrightness: 0.6, flowWaves: 3, flowSpeed: 0.05 },
    // grey cleaners: eat only drifting pieces of at most `maxPiece` (3) voxels, the nearest first;
    // with none about they fly with the swarm
    cleaner: { count: START_EACH, maxPiece: 3, color: 0x9aa3ad },
    // orange drills: fly to the nearest voxel like eaters; there they drill straight towards the
    // planet's centre (off it by up to `spread` at random) at `speed`, everything within `power` × the
    // player's Power (crater radius) of the bit gone — at the default Power 0.5: 0.375, about 0.75 voxels
    // (a point each) — until they have been in empty space for `emptyFrames` after the last voxel or
    // drilled `maxLength`; then they fly on as usual. The bit: a spiral cone (`bitLength`, `bitRadius`)
    // turning `bitSpin` radians per frame, shown while drilling
    drill: { count: START_EACH, speed: 0.08, power: 0.75, emptyFrames: 25, maxLength: 60, spread: 0.35, debris: 4, color: 0xff8a1f,
      bitColor: 0xff9a2e, bitDark: 0x7a2c00, bitLength: 0.6, bitRadius: 0.16, bitSpin: 0.6 },
    // copper piercers: from `reach` (20 voxels) an orange laser with a yellow lightning winding round it
    // in a spiral; it goes through `pierce` (3) voxels in a row — the bite and the next ones behind it
    // along the beam — and eats them all at once, each at `damage` (0.8) × an eater's rate per voxel.
    // The spiral: `spiralRadius` around the beam, `spiralTurns` turns per unit, a fresh flash every
    // `flashEvery` frames lasting `flashFrames`, with a `glowPx` glow (like the support ships' bolt)
    // Once aimed it locks the line through its bite and fires along it until it is through (no voxel
    // left on it, all the way to the far side), then `afterFrames` (2 s) more with the beam going on
    // `farLength` into space (the spiral round it `spiralMaxLength` at most); then it switches off and flies on.
    piercer: { count: START_EACH, reach: 10, pierce: 3, damage: 0.8, afterFrames: 120, farLength: 400, color: 0xc0703a,
      width: 0.4, hitSize: 1.2, beamColors: ['rgba(110,40,0,1)', 'rgba(255,140,30,1)', 'rgba(255,240,200,1)'], hitColors: ['rgba(255,235,200,1)', 'rgba(255,140,40,0.9)', 'rgba(170,70,0,0.35)'],
      spiralColor: 0xffe03a, spiralRadius: 0.22, spiralTurns: 0.64, spiralPoints: 10, spiralMaxLength: 90, flashEvery: 3, flashFrames: 5, glowPx: 4 },
    // teal snipers: from any distance, at their bite: stop, charge `chargeFrames` (5 s) facing it, fire,
    // fly on for `moveFrames` (1 s), stop and charge again. The shot: a thin streak (`shotSize`, a
    // little smaller than an eater) starting at `speed`, `accel` × faster for every voxel flown (5%),
    // straight at the bite; it always destroys the voxel it hits (a point). In front of it a rounded
    // glowing cap like a meteor's (`shockRadius`, `shockColor` → `shockCore` at the front), a wake
    // `wake` × its speed-up long behind, a flash at the hit
    sniper: { count: START_EACH, chargeFrames: 300, moveFrames: 60, speed: 0.05, accel: 1.05, color: 0x2fe0c0,
      shotSize: [0.07, 0.07, 0.5], shotColor: 0xeaffff, shockRadius: 0.14, shockLength: 0.45, shockColor: 0xff9a3c, shockCore: 0xfff4d8, wake: 0.6,
      flashFrames: 10, flashSize: 1.6 },
    // blue splashers: from `range` (10 voxels) fire a bubble of liquid (`size`, 3 voxels across: an
    // irregular, wobbling drop that bends the picture like a lens) at `speed`, one at a time; where it
    // hits, a block of `area` voxels (3 × 3 across the surface, 2 deep) soaks for `soakFrames` (3 s),
    // weakening all the while, and is gone at the end (a point each); `splash` drops of debris
    splasher: { count: START_EACH, range: 5, speed: 0.07, size: 1.5, wobble: 0.08, soakFrames: 180, area: [3, 3, 2],
      splash: 10, color: 0x3f7dff, splashColor: [0.55, 0.8, 1] },
    // pink boosters: don't eat — they fly with the swarm, each in a gentle force field (`radius`: 5
    // voxels across, a ball of octagonal cells in pinks); your own ships inside any field get `boost`
    // × your Power (+20%: the crater radius — drills' too — and how hard they eat, eaters, lasers, storms and
    // piercers; several fields don't add up). The field: `cells` octagons along each of the
    // six sides of a cube blown up to a ball, lines `line` wide, `fill` and `rim` glow, turning `spin`
    booster: { count: START_EACH, radius: 1.25, boost: 1.2, color: 0xff5fb8,
      fieldColors: [0xff4fa8, 0xffb3e0], cells: 3, line: 0.05, opacity: 0.7, fill: 0.07, rim: 0.5, spin: 0.004, segments: 32 },
    // crimson cutters: pick a bite like an eater and, from `reach` (20 voxels), lock a flat red sheet on it —
    // as wide as what it hits (the solid voxels in a row across the sheet, at most `maxHalf` voxels each
    // side of the line): a red ray along each edge, a glowing haze between them like a flat laser through
    // smoke. The whole row is cut at once (each voxel `damage` × an eater's rate, like a piercer); when it
    // is gone the sheet goes deeper along the line, until through; then for `afterFrames` (1 s) it shines on
    // through the cut, `farLength` into space, and the cutter flies on
    cutter: { count: START_EACH, reach: 10, damage: 0.8, maxHalf: 12, color: 0xc8102e, sheetColor: 0xff2020, edgeColor: 0xff5a4a,
      apex: 0.12, hazeSpeed: 1, opacity: 0.85, afterFrames: 60, farLength: 400 },
    // planet eaten: every ship jumps to hyperspace after a random wait (0 … `window` frames) and is gone
    // after `frames`, speeding up (× `accel` per frame, at most `maxSpeed`), away from the planet
    // (`outward`), leaving a streak (`width`, colours, `streaks` lines) that fades in `trailFade` frames
    warp: { window: 150, frames: 40, accel: 1.16, maxSpeed: 4, outward: 0.8, trailFade: 25, width: 0.35,
      color: 0x3a8dff, streakColor: 0xb5ecff, streaks: 6 },
    groupArrive: 3,          // a group sent to a point (ship bar + click) got there once one of its ships is this close (or has landed)
    aimAngle: 12,            // a ship eats (a laser ship fires) only once it faces its bite within this many degrees
    // a unit that hasn't eaten for `frames` (10 s) while it has a bite stops for `pauseFrames`
    // (0.5 s), then takes another bite — or the same one if there is no other
    retarget: { frames: 600, pauseFrames: 30 },
    biteRadius: 0.5,         // power: radius of the crater eaten out of a bite
    spawnSpread: 4,
    spawnGap: 1,             // spawn distance from the planet's surface, in planet radii
    color: 0x8fd0ff,         // the swarm's colour in single player (click marker)
    eaterColor: 0xffd84a,    // eaters are yellow (every player)
    size: [0.14, 0.14, 0.7],
  },

  // the spawn point: a subspace tunnel. Closed: a small vortex (`closedRadius`); it opens (`openFrames`)
  // to `openRadius` when the ships arrive — they come out over `emergeWindow` frames — and closes
  // (`closeFrames`) `linger` frames after the last; a tug's delivery opens it for `pulseFrames`
  portal: { closedRadius: 0.7, openRadius: 4, openFrames: 50, closeFrames: 60, pulseFrames: 90, emergeWindow: 90, linger: 40,
    hitRadius: 2.5,
    // while opening 10° narrower (widening back over `narrowFrames` once open); a trumpet's bell at the
    // wide end (`flare`); 35 light streaks bunched unevenly, their last `fadeEnd` (20%) fading out
    narrowing: 10, narrowFrames: 30, flare: 2.2, streaks: 35, fadeEnd: 0.2,
    color: 0x2f7dff, innerColor: 0x8fe0ff, rimColor: 0x1d46ff, coreColor: 0xd6f2ff },

  // after a planet is eaten the swarms jump to hyperspace; the next planet appears once every
  // swarm is gone (or after this many frames)
  beacon: { returnTimeoutFrames: 1500 },

  // multiplayer (WebRTC via PeerJS)
  net: {
    idPrefix: 'hive-hunger-', // PeerJS id = prefix + room code
    codeLength: 6,
    snapshotEvery: 4,         // frames between state updates sent to guests (≈15 per second)
    maxBuffered: 1 << 20,     // skip an update while more than this many bytes wait to be sent
    follow: 0.35,             // guests: how quickly units move towards the positions from the host
    pingMs: 2000,             // "still here" message interval
    timeoutMs: 10000,         // a player silent for this long has lost the connection
    noticeMs: 6000,           // how long notices (joined / left / connection lost) stay in the HUD
  },

  // pieces bitten off a planet: every part smaller than the rest comes loose, drifts away from the
  // centre and turns; the swarm can still eat it (same points). Per frame: drift and spin are the
  // starting speed (units) and turn (radians); damping slows the drift (it stops after ≈ drift / (1 − damping)).
  fragments: {
    drift: 0.01,
    damping: 0.997,
    spin: 0.006,
    spinDamping: 1,       // 1 = keeps turning
    maxRimSpeed: 0.025,   // a piece's edge moves at most this fast (half the default unit speed): big pieces turn slower
    maxDistance: 4,       // a piece stops this far from where it came off
    maxSteps: 400000,     // flood-fill limit when looking for a split (bigger parts: no split found)
    syncEvery: 30,        // frames between fragment positions sent to the guests
    towSyncEvery: 6,      // … while a piece is being towed
  },

  // black holes left by bombers: `grow` frames growing (1 s), `hold` (2 s), `shrink` (1 s);
  // `size` = Einstein radius (how far the picture bends), `range` = pull range (15 voxels), gentle
  // pulls on debris and drifting pieces (`maxPieceSpeed`), swallowed within `core`
  holes: { grow: 60, hold: 120, shrink: 60, size: 2.2, range: 7.5, core: 0.9, pullDebris: 0.004, pullPieces: 0.0015,
    maxPieceSpeed: 0.05, ringColor: 0xc9a0ff },

  // marker shown where the player clicked
  marker: { color: 0x8fd0ff, radius: 1.6, opacity: 0.9, lift: 0.9, lifeFrames: 240, pulseSpeed: 0.12 },

  debris: {
    max: 4000,
    perCell: 1,
    perCellOnFinish: 1,
    minSpeed: 0.06,
    maxSpeed: 0.28,
    jitter: 0.18,
    friction: 0.98,
    fade: 0.012,
    size: 0.28,
  },
});
