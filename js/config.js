// All game parameters in one place (1 unit = 1 in the 3D world).
// at the start every player has START_EACH ships of every type (eaters, laser ships, storm ships,
// tugs, bombers, orb ships, support ships, cleaners, drills): 2 × 9 = 18 units
const START_EACH = 2;
const START_UNITS = START_EACH * 9;

/**
 * Ship types other than eaters, in the order their units come in the swarm: units 0 … lasers−1 are
 * laser ships, then storm ships, and so on; the rest are eaters. Each key is also the setting (and
 * the Ship types slider) with how many there are.
 */
export const SHIP_KINDS = ['lasers', 'storms', 'tugs', 'bombers', 'orbs', 'supports', 'cleaners', 'drills'];
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
    spinSpeed: 0.0005,     // planet rotation, radians per frame (one turn ≈ 3.5 min at 60 fps)
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

  // Planets in a cycle: planet 1 uses the first entry, planet 6 the first again, …
  // shape: 'sphere' (default), 'cube' (half-edge = radius), 'pair' (sphere + cube, `gap` voxels
  // apart), 'boxes' (every box shape up to max×max×max once, `gap` apart), 'text' (voxel letters) — see shapes.js.
  // radiusScale × planet.radius = the radius (sphere) or half-edge (cube).
  // style = graphics only (physics and eating always use the voxels): 'cubes' — the voxels;
  // 'smooth' — a smooth surface over them; 'wedges' — cubes plus low-poly wedges in the steps.
  // Every level uses 'smooth' (the owner's choice); the other styles stay available.
  levels: [
    // test board: every box shape from 1×1×1 to 4×4×4 voxels once (20, no rotated copies), 5 voxels apart
    { shape: 'boxes', max: 4, gap: 5, style: 'smooth' },
    { radiusScale: 1, style: 'smooth' },
    { shape: 'cube', radiusScale: 0.7, style: 'smooth' }, // edge = the diameter of a 0.7 sphere (the board's)
    {
      shape: 'text', text: 'TEST LVL', style: 'smooth',
      pixel: 3,  // voxels per font pixel
      depth: 10, // thickness in voxels
      colors: [[255, 84, 84], [255, 160, 60], [255, 220, 70], [110, 220, 90], [70, 200, 230], [90, 120, 255], [200, 100, 240]],
    },
    // test board: a sphere and a cube the size of the old planet 1, 10 voxels apart
    { shape: 'pair', radiusScale: 0.7, gap: 10, style: 'smooth' },
  ],

  // Flock (boids). Every unit flies at the same constant speed — only its direction changes.
  swarm: {
    count: START_UNITS,
    minCount: 0,             // (the Units slider starts at 10; bombers that blew up can take the swarm lower)
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
    // planet eaten: every ship jumps to hyperspace after a random wait (0 … `window` frames) and is gone
    // after `frames`, speeding up (× `accel` per frame, at most `maxSpeed`), away from the planet
    // (`outward`), leaving a streak (`width`, colours, `streaks` lines) that fades in `trailFade` frames
    warp: { window: 150, frames: 40, accel: 1.16, maxSpeed: 4, outward: 0.8, trailFade: 25, width: 0.35,
      color: 0x3a8dff, streakColor: 0xb5ecff, streaks: 6 },
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

  // Panel sliders (changes apply live)
  controls: [
    { id: 'count',  label: 'Units',    min: 10,   max: 100,  step: 10,   decimals: 0 },
    { id: 'speed',  label: 'Speed',    min: 0.05, max: 0.6,  step: 0.01, decimals: 2 },
    { id: 'power',  label: 'Power',    min: 0.5,  max: 3,    step: 0.1,  decimals: 1 },
    { id: 'turn',   label: 'Turning',  min: 0.02, max: 0.3,  step: 0.01, decimals: 2 }, // how fast ships turn their nose (turnSmoothing)
  ],

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
