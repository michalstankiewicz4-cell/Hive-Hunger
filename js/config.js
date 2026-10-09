// All game parameters in one place (1 unit = 1 in the 3D world).
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
    atmosphere: { color: [120, 180, 255], scale: 1.12, power: 2.2, intensity: 0.5 },

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

  // Planets in a cycle: planet 1 uses the first entry, planet 7 the first again, …
  // shape: 'sphere' (default), 'cube' (half-edge = radius), 'text' (voxel letters, see shapes.js).
  // radiusScale × planet.radius = the radius (sphere) or half-edge (cube).
  // style = graphics only (physics and eating always use the voxels): 'cubes' — the voxels;
  // 'smooth' — a smooth surface over them; 'wedges' — cubes plus low-poly wedges in the steps.
  // New looks and shapes are tried out as new levels.
  levels: [
    { radiusScale: 0.7, style: 'cubes' },
    { radiusScale: 1, style: 'cubes' },
    { radiusScale: 1, style: 'smooth' },
    { radiusScale: 1, style: 'wedges' },
    { shape: 'cube', radiusScale: 0.7, style: 'cubes' }, // the size of planet 1's sphere
    {
      shape: 'text', text: 'TEST LVL', style: 'cubes',
      pixel: 3,  // voxels per font pixel
      depth: 10, // thickness in voxels
      colors: [[255, 84, 84], [255, 160, 60], [255, 220, 70], [110, 220, 90], [70, 200, 230], [90, 120, 255], [200, 100, 240]],
    },
  ],

  // Flock (boids). Every unit flies at the same constant speed — only its direction changes.
  swarm: {
    count: 20,
    minCount: 10,
    maxCount: 1500,
    speed: 0.05,             // units per frame, identical for all
    perception: 3,           // how far a unit sees its neighbours
    separationDistance: 1.5, // distance below which units push each other away
    turnRate: 0.07,          // how fast a unit can turn
    turnSmoothing: 0.12,     // how quickly the drawn heading follows the flying direction (lower = smoother)
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
    nearestMode: true,       // test mechanic: after eating, fly to the nearest uneaten voxel (checkbox)
    feedFlocking: 0.35,      // while feeding: how much alignment and cohesion remain
    eatFrames: 25,           // frames a unit sits on its bite before it is eaten
    biteRadius: 0.5,         // power: radius of the crater eaten out of a bite
    spawnSpread: 4,
    spawnGap: 1,             // spawn distance from the planet's surface, in planet radii
    color: 0x8fd0ff,
    size: [0.14, 0.14, 0.7],
  },

  // Panel sliders (changes apply live)
  controls: [
    { id: 'count',  label: 'Units',    min: 10,   max: 1500, step: 10,   decimals: 0 },
    { id: 'speed',  label: 'Speed',    min: 0.05, max: 0.6,  step: 0.01, decimals: 2 },
    { id: 'power',  label: 'Power',    min: 0.5,  max: 3,    step: 0.1,  decimals: 1 },
    { id: 'spacing',  label: 'Spacing',  min: 0.3, max: 3,   step: 0.1, decimals: 1 },
    { id: 'cohesion', label: 'Cohesion', min: 0,   max: 3,   step: 0.1, decimals: 1 },
    { id: 'nearest', type: 'toggle', label: 'Eat nearest block' },
  ],

  // beacon at the spawn point: click it to call the swarm back; after a planet is eaten
  // the swarm returns here and the next planet appears once it has gathered
  beacon: { color: 0xffc861, size: 0.9, hitRadius: 3, arriveRadius: 2.5, gatherRadius: 10, returnTimeoutFrames: 1500 },

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
