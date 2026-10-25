/**
 * The Hive Carrier — the player's mothership — as voxels: 240 long (5 × Earth's 48 across), 64 wide,
 * 48 high. A flat carrier: a wedge of a bow, an island tower on the starboard side, an engine block
 * with four nozzles at the stern; sunk into the deck a honeycomb of launch cells in a bee's colours —
 * light wax rims, golden wax walls, cells glowing like honey — on the grey deck, inside black-and-yellow stripes.
 *
 * Axes: x along the ship (0 the stern, NX − 1 the bow's tip), y up, z across (port at 0).
 * Returns
 *   NX, NY, NZ   grid size
 *   hp           1 = solid hull voxel (0 = empty or a light)
 *   colors       r, g, b per voxel (0 … 255)
 *   tags         the module of every voxel (MODULES' index + 1; 0 = none)
 *   lights       voxels that glow: { x, y, z, color, kind } — the cells' floors, windows, reactor vents,
 *                the nozzles' throats
 *   beacons      running lights { x, y, z, color, period } and `nozzles` { y, z, r }
 * Every voxel knows its module, so modules can later be shown damaged (see-through) one by one.
 */

export const MODULES = Object.freeze([
  { id: 'hull', name: 'Hull', text: 'The armoured body holding it all together.' },
  { id: 'bridge', name: 'Bridge', text: 'The island tower: command, navigation, the swarm’s orders.' },
  { id: 'reactor', name: 'Reactor', text: 'The power core in the middle of the ship — the vents along its sides glow.' },
  { id: 'engines', name: 'Engines', text: 'Four great nozzles at the stern: the jumps through hyperspace.' },
  { id: 'hive', name: 'Launch hive', text: 'The honeycomb of launch cells sunk into the deck — where the ships take off.' },
  { id: 'refinery', name: 'Refinery', text: 'Tanks for the water, lava and gas the siphons and scoops bring in.' },
  { id: 'sensors', name: 'Sensor array', text: 'The mast and antennas on top of the tower.' },
]);

const TAG = Object.fromEntries(MODULES.map((m, i) => [m.id, i + 1]));

export const CARRIER_SIZE = Object.freeze({ NX: 240, NY: 48, NZ: 64 });

// colours
const HULL = [72, 78, 88], LINE = [50, 54, 62], DECK = [60, 64, 72], WALL = [104, 112, 124], TOWER = [122, 130, 142];
// the launch hive in a bee's colours: a rim of light wax round every cell, a little lighter than the honey
// glowing inside, walls of golden wax down into it; the deck between the cells stays grey
const RIMS = [236, 196, 104], WAX = [196, 138, 34];
const STRIPE = [70, 140, 230], YELLOW = [228, 186, 44], BLACK = [32, 32, 36], RIM = [150, 154, 164], ENGINE = [56, 59, 66];
const GLASS = [40, 52, 66];
const LIGHT = { cell: [255, 178, 40], window: [255, 224, 165], bridge: [190, 232, 255], vent: [130, 215, 255], nozzle: [175, 225, 255] };

export function buildCarrierVoxels() {
  const { NX, NY, NZ } = CARRIER_SIZE;
  const N = NX * NY * NZ;
  const hp = new Uint8Array(N), colors = new Uint8Array(N * 3), tags = new Uint8Array(N);
  const lightAt = new Map(); // voxel index → light
  const id = (x, y, z) => (z * NY + y) * NX + x;
  const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < NX && y < NY && z < NZ;
  // a little noise per hull plate (6 × 6 voxels) so the hull reads as plates, not one flat colour
  const plate = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; return ((h >>> 0) % 1000) / 1000; };
  const set = (x, y, z, col, tag) => {
    if (!inside(x, y, z)) return;
    const i = id(x, y, z);
    hp[i] = 1; tags[i] = tag; lightAt.delete(i);
    colors[i * 3] = col[0]; colors[i * 3 + 1] = col[1]; colors[i * 3 + 2] = col[2];
  };
  const clear = (x, y, z) => { if (inside(x, y, z)) { const i = id(x, y, z); hp[i] = 0; lightAt.delete(i); } };
  const light = (x, y, z, kind, tag) => {
    if (!inside(x, y, z)) return;
    const i = id(x, y, z);
    hp[i] = 0; tags[i] = tag;
    lightAt.set(i, { x, y, z, color: LIGHT[kind], kind });
  };
  const solid = (x, y, z) => inside(x, y, z) && hp[id(x, y, z)] === 1;
  const zc = NZ / 2 - 0.5;

  // --- the hull: deck on top, a keel narrowing below, the bow a wedge ------------------------
  const halfWidth = (x) => (x < 32 ? 30 : x < 185 ? 28 : Math.max(1.5, 28 * (1 - (x - 185) / 56)));
  const deckY = (x) => (x < 32 ? 30 : x < 185 ? 22 : 22 - (x - 185) * 0.12);
  const bottomY = (x) => (x < 32 ? 4 : x < 185 ? 6 : 6 + (x - 185) * 0.1);
  for (let x = 8; x < NX; x++) {
    const hw = halfWidth(x), top = deckY(x), bot = bottomY(x);
    for (let y = Math.floor(bot); y < top; y++) {
      // the lower half narrows to a keel
      const k = Math.min(1, (y - bot) / Math.max(1, (top - bot) * 0.5));
      const w = hw * (0.55 + 0.45 * k);
      for (let z = 0; z < NZ; z++) {
        if (Math.abs(z - zc) > w) continue;
        const p = plate(Math.floor(x / 6), Math.floor((y + z) / 6));
        const line = x % 6 === 0;
        const c = line ? LINE : HULL.map((v) => v + Math.round((p - 0.5) * 18));
        set(x, y, z, c, x < 32 ? TAG.engines : TAG.hull);
      }
    }
  }
  // the deck's top layer: darker plates (the engine block keeps its own)
  for (let x = 32; x < NX; x++) for (let z = 0; z < NZ; z++) {
    const y = Math.ceil(deckY(x)) - 1;
    if (!solid(x, y, z)) continue;
    const p = plate(Math.floor(x / 8), Math.floor(z / 8));
    set(x, y, z, DECK.map((v) => v + Math.round((p - 0.5) * 12)), TAG.hull);
  }
  // the engine block: darker, and a step up behind the deck
  for (let x = 8; x < 32; x++) for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++) if (solid(x, y, z)) {
    const i = id(x, y, z);
    colors.set(x % 5 === 0 ? LINE : ENGINE, i * 3);
  }

  // --- four nozzles at the stern: rings, their throats glowing ----------------------------
  const nozzles = [8, -8, 21, -21].map((dz) => ({ y: 17, z: zc + dz, r: 6.5 }));
  for (const n of nozzles) {
    for (let x = 0; x < 10; x++) for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++) {
      const r = Math.hypot(y - n.y, z - n.z);
      if (r > n.r) continue;
      if (x < 8 && r >= n.r - 2) set(x, y, z, x < 2 ? RIM : ENGINE, TAG.engines);
      else if (x < 8) clear(x, y, z);
      else if (x === 8 || x === 9) {
        if (r < n.r - 2) { clear(x, y, z); if (x === 9) light(x, y, z, 'nozzle', TAG.engines); }
      }
    }
  }

  // --- the launch hive: hexagonal cells sunk into the deck, lit from below -----------------
  const HX0 = 44, HX1 = 180, HZ = 23, R = 5.4, WALLW = 1.3, DEPTH = 4, SQ3 = Math.sqrt(3);
  const deckTop = 22; // (between the engine block and the bow: deck voxels at y 21)
  const cells = [];
  for (let col = 0; ; col++) {
    const cx = HX0 + R + col * 1.5 * R;
    if (cx + R > HX1) break;
    for (let row = -4; row <= 4; row++) {
      const cz = zc + row * SQ3 * R + (col % 2 ? (SQ3 * R) / 2 : 0);
      if (Math.abs(cz - zc) + (SQ3 * R) / 2 > HZ) continue;
      cells.push({ cx, cz });
    }
  }
  const inHex = (dx, dz, r) => Math.abs(dz) <= (r * SQ3) / 2 && SQ3 * Math.abs(dx) + Math.abs(dz) <= SQ3 * r;
  for (let x = HX0 - 1; x <= HX1 + 1; x++) for (let z = 0; z < NZ; z++) {
    // the field's floor plates around the cells: lighter steel walls between them
    if (Math.abs(z - zc) <= HZ + 0.5) set(x, deckTop - 1, z, WALL, TAG.hive);
    for (let ci = 0; ci < cells.length; ci++) {
      const c = cells[ci];
      if (!inHex(x - c.cx, z - c.cz, R - WALLW)) continue;
      for (let y = deckTop - DEPTH; y < deckTop; y++) clear(x, y, z);
      light(x, deckTop - DEPTH - 1, z, 'cell', TAG.hive);
      lightAt.get(id(x, deckTop - DEPTH - 1, z)).cell = ci; // (a cell's floor pulses as one)
      for (let y = deckTop - DEPTH; y < deckTop; y++) tags[id(x, y, z)] = TAG.hive;
    }
  }
  // the cells' walls take the hive's colour too
  for (let x = HX0 - 1; x <= HX1 + 1; x++) for (let z = 0; z < NZ; z++) for (let y = deckTop - DEPTH - 1; y < deckTop; y++) {
    if (!solid(x, y, z) || Math.abs(z - zc) > HZ + 0.5) continue;
    const i = id(x, y, z);
    tags[i] = TAG.hive;
    // on the deck: a rim round each cell (within its outline), grey between the cells; below it: the cells' wax walls
    const rim = cells.some((c) => inHex(x - c.cx, z - c.cz, R - WALLW + 1.1));
    if (y === deckTop - 1) colors.set(rim ? RIMS : WALL, i * 3);
    else colors.set(WAX, i * 3);
  }
  // hazard stripes round the field
  for (let x = HX0 - 4; x <= HX1 + 4; x++) for (let z = 0; z < NZ; z++) {
    const dz = Math.abs(z - zc), inBand = (x < HX0 - 1 || x > HX1 + 1) ? dz <= HZ + 3 : dz > HZ + 0.5 && dz <= HZ + 3;
    if (!inBand || !solid(x, deckTop - 1, z)) continue;
    set(x, deckTop - 1, z, Math.floor((x + z) / 3) % 2 ? YELLOW : BLACK, TAG.hive);
  }

  // --- the reactor amidships: vents glowing along both sides --------------------------------
  for (let x = 92; x <= 112; x++) for (let y = 7; y < 22; y++) for (let z = 0; z < NZ; z++) {
    if (!solid(x, y, z)) continue;
    tags[id(x, y, z)] = TAG.reactor;
  }
  for (let x = 93; x <= 111; x += 3) for (let y = 10; y <= 16; y++) for (const side of [-1, 1]) {
    const z = outerZ(x, y, side);
    if (z !== null) light(x, y, z, 'vent', TAG.reactor);
  }

  // --- the refinery: three tanks along the port side ----------------------------------------
  const tanks = [{ x0: 36, x1: 56, col: [70, 120, 190] }, { x0: 60, x1: 80, col: [190, 90, 40] }, { x0: 124, x1: 144, col: [170, 140, 205] }];
  for (const t of tanks) for (let x = t.x0; x <= t.x1; x++) for (let y = 6; y < 20; y++) for (let z = 0; z < 12; z++) {
    const r = Math.hypot((y - 12.5) / 1.1, z - 4);
    if (r > 5) continue;
    const band = (x - t.x0) % 7 === 0 || x === t.x1;
    set(x, y, z, band ? RIM : t.col.map((v) => v + Math.round((plate(x, y) - 0.5) * 14)), TAG.refinery);
  }

  // --- a stripe in the player's colour and rows of windows down both sides ------------------
  for (let x = 34; x < 200; x++) for (const side of [-1, 1]) {
    for (const y of [18, 19]) { const z = outerZ(x, y, side); if (z !== null && tags[id(x, y, z)] !== TAG.refinery) colors.set(STRIPE, id(x, y, z) * 3); }
    if (x % 4 !== 1 || (x >= 90 && x <= 114)) continue;
    for (const y of [9, 14]) {
      const z = outerZ(x, y, side);
      if (z === null || tags[id(x, y, z)] === TAG.refinery) continue;
      // most are lit, some dark
      if (plate(x * 3 + side, y) < 0.82) light(x, y, z, 'window', tags[id(x, y, z)] || TAG.hull);
      else set(x, y, z, GLASS, tags[id(x, y, z)] || TAG.hull);
    }
  }

  // --- the island tower on the starboard side: the bridge, the mast and antennas -------------
  const T = { x0: 118, x1: 150, z0: 49, z1: 62 };
  for (let x = T.x0; x <= T.x1; x++) for (let y = 22; y < 32; y++) for (let z = T.z0; z <= T.z1; z++) {
    // it leans in a little at the back
    if (x < T.x0 + (y - 22) * 0.5) continue;
    set(x, y, z, x % 6 === 0 ? LINE : TOWER, TAG.bridge);
  }
  for (let x = 126; x <= 147; x++) for (let y = 32; y < 38; y++) for (let z = 51; z <= 61; z++) set(x, y, z, TOWER, TAG.bridge);
  // the bridge's window band all round
  for (let x = 126; x <= 147; x++) for (let z = 51; z <= 61; z++) {
    const edge = x === 126 || x === 147 || z === 51 || z === 61;
    if (edge) for (const y of [34, 35]) light(x, y, z, 'bridge', TAG.bridge);
  }
  // windows on the tower's lower block
  for (let x = 124; x <= 148; x += 3) for (const y of [25, 28]) { light(x, y, T.z0, 'window', TAG.bridge); light(x, y, T.z1, 'window', TAG.bridge); }
  // the mast, a cross-bar and a small dish
  for (let y = 38; y < 47; y++) for (const [x, z] of [[136, 56], [137, 56], [136, 57], [137, 57]]) set(x, y, z, RIM, TAG.sensors);
  for (let x = 130; x <= 143; x++) set(x, 43, 56, RIM, TAG.sensors);
  for (let x = 140; x <= 146; x++) for (let z = 53; z <= 60; z++) if (Math.hypot(x - 143, z - 56.5) <= 3.2) set(x, 39, z, WALL, TAG.sensors);

  // running lights
  const beacons = [
    { x: NX - 1, y: Math.round(deckY(NX - 1)), z: zc, color: [255, 255, 255], period: 1.6 },
    { x: 10, y: 31, z: 1, color: [255, 60, 50], period: 2.2 },
    { x: 10, y: 31, z: NZ - 2, color: [60, 255, 120], period: 2.2 },
    { x: 136.5, y: 47, z: 56.5, color: [255, 70, 60], period: 1.2 },
  ];

  return { NX, NY, NZ, hp, colors, tags, lights: [...lightAt.values()], beacons, nozzles, cells: cells.length };

  /** The outermost solid voxel on the port (−1) or starboard (+1) side at (x, y), or null. */
  function outerZ(x, y, side) {
    if (side < 0) { for (let z = 0; z < NZ; z++) if (solid(x, y, z)) return z; }
    else for (let z = NZ - 1; z >= 0; z--) if (solid(x, y, z)) return z;
    return null;
  }
}
