// Wszystkie parametry gry w jednym miejscu (jednostka = 1 w świecie 3D).
export const CONFIG = Object.freeze({
  background: 0x0b0c14,
  fov: 50,
  camera: { distance: 75, minDistance: 35, maxDistance: 160, rotateSpeed: 0.006, zoomSpeed: 0.08 },

  // Tło kosmosu
  space: {
    radius: 1500,
    backgroundRgb: [11, 12, 20],
    nebulaTexture: { width: 512, height: 256 },
    nebula: {
      scale: 1.3,
      octaves: 5,
      threshold: 0.42,   // poniżej — pusta przestrzeń
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

  // „Mózg” roju: punkt, do którego leci stado (jednostki na klatkę)
  leader: {
    maxSpeed: 0.12,
    steer: 0.02,
    brake: 0.9,
    slowRadius: 6,
    arriveRadius: 1.2,
    dwellFrames: 90,   // ile klatek zostaje w klikniętym miejscu, zanim znów działa sam
    feedSenseRadius: 10, // w tym promieniu od celu osobniki wybierają kąski; cel rusza dalej, gdy nic tu nie zostało
    searchSamples: 600,
  },

  planet: {
    radius: 24,
    voxelSize: 0.5,        // mniejszy = gładsza kula, więcej wokseli
    terrainDepth: 1.6,     // grubość warstwy z kolorami terenu
    finishThreshold: 0.03, // poniżej tej części planeta się rozsypuje
    nextPlanetDelay: 1500, // ms
    strength: 1,
    rock: [96, 84, 74],     // wnętrze pod powierzchnią (skała)
    rockCore: [58, 50, 46], // ciemniejsza skała przy środku
    light: [-0.55, 0.6, 0.58],
    sphereShading: 0.7,    // 0 = płaskie ścianki, 1 = gładka kula
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

  // Stado (boids). Każdy osobnik leci ze stałą, identyczną prędkością — zmienia się tylko kierunek.
  swarm: {
    count: 350,
    minCount: 10,
    maxCount: 1500,
    speed: 0.22,             // jednostek na klatkę, takie samo dla wszystkich
    perception: 3,           // zasięg widzenia sąsiadów
    separationDistance: 1.1, // dystans, poniżej którego osobniki się odpychają
    turnRate: 0.07,          // jak szybko osobnik może skręcać
    weights: {
      separation: 1.8,       // trzymaj dystans
      alignment: 1.0,        // leć w tę samą stronę co sąsiedzi
      cohesion: 0.6,         // trzymaj się grupy
      target: 1.1,           // leć do celu roju
      feed: 3.0,             // leć w swój kąsek (gdy rój jest przy materii)
    },
    feedFlocking: 0.35,      // przy jedzeniu: ile zostaje z wyrównania i spójności
    eatFrames: 25,           // ile klatek osobnik siedzi na kąsku, zanim go wygryzie
    biteRadius: 1.3,         // siła: promień krateru wygryzanego z kąska
    spawnSpread: 4,
    color: 0x8fd0ff,
    size: [0.14, 0.14, 0.7],
  },

  // Suwaki w panelu (zmiany działają na żywo)
  controls: [
    { id: 'count',  label: 'Osobniki', min: 10,   max: 1500, step: 10,   decimals: 0 },
    { id: 'speed',  label: 'Prędkość', min: 0.05, max: 0.6,  step: 0.01, decimals: 2 },
    { id: 'power',  label: 'Siła',     min: 0.5,  max: 3,    step: 0.1,  decimals: 1 },
    { id: 'spacing',  label: 'Odstęp',   min: 0.3, max: 3,   step: 0.1, decimals: 1 },
    { id: 'cohesion', label: 'Spójność', min: 0,   max: 3,   step: 0.1, decimals: 1 },
  ],

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
