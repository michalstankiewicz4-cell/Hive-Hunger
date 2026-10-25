/**
 * The Hive Carrier — the player's mothership — as voxels: 240 long (5 × Earth's 48 across), 72 wide,
 * 64 high. A heavy, boxy carrier in a patchwork of light grey, grey, dark grey and anthracite voxels with
 * yellow accents: a long dark flight deck with yellow lines and pads and a few ships parked on it, a
 * stepped command tower with antennas, a row of big yellow honeycomb modules along each side, a blunt
 * bow with the hangar bay's mouth framed in honeycomb, and at the stern an engine block with four great
 * nozzles in two pairs, glowing blue.
 *
 * Axes: x along the ship (0 the stern, NX − 1 the bow), y up, z across (port at 0).
 * Returns
 *   NX, NY, NZ   grid size
 *   hp           1 = solid hull voxel (0 = empty or a light)
 *   colors       r, g, b per voxel (0 … 255)
 *   tags         the module of every voxel (MODULES' index + 1; 0 = none)
 *   lights       voxels that glow: { x, y, z, color, kind } — honeycomb cells (`cell`: with the number of
 *                the honeycomb they pulse with), windows, the bridge, reactor vents, the hangar, nozzles
 *   beacons      running lights { x, y, z, color, period }; `nozzles` { y, z, r }; `hives` honeycombs
 * Every voxel knows its module, so modules can later be shown damaged (see-through) one by one.
 */

export const MODULES = Object.freeze([
  { id: 'hull', name: 'Hull', text: 'The armoured body holding it all together.' },
  { id: 'bridge', name: 'Bridge', text: 'The command tower: communication, navigation, flight control.' },
  { id: 'reactor', name: 'Reactor', text: 'The power core in the middle of the ship — the vents along its sides glow.' },
  { id: 'engines', name: 'Engines', text: 'The engine block: four great nozzles in two pairs — the jumps through hyperspace.' },
  { id: 'deck', name: 'Flight deck', text: 'Where the ships take off and land.' },
  { id: 'hangar', name: 'Hangar bay', text: 'The bow’s mouth framed in honeycomb: where the ships fly in and out.' },
  { id: 'hive', name: 'Hive modules', text: 'The honeycomb modules along both sides: stores, hangars and systems of the swarm.' },
  { id: 'refinery', name: 'Refinery', text: 'Tanks under the keel for the water, lava and gas the siphons and scoops bring in.' },
  { id: 'sensors', name: 'Sensor array', text: 'The antennas on top of the tower.' },
]);

const TAG = Object.fromEntries(MODULES.map((m, i) => [m.id, i + 1]));

export const CARRIER_SIZE = Object.freeze({ NX: 240, NY: 64, NZ: 72 });

// the palette (the reference: main panels light grey, structure grey, armour dark grey / anthracite,
// honeycomb yellow / gold, markings yellow, details orange, windows and nozzles blue, the hangar warm white)
// (the greys close enough that the smooth surface's blending between voxels doesn't smear them)
const LIGHTP = [168, 172, 178], MIDP = [128, 132, 140], DARKP = [92, 95, 102], ANTH = [62, 64, 70];
const YEL = [228, 174, 40], GOLD = [198, 138, 26], GOLD_LINE = [104, 66, 12], ORANGE = [214, 112, 32];
// the honeycomb grown over the deck: wax, older wax (darker, lower down), light caps, dark honey inside
const WAX = [214, 156, 44], WAX_OLD = [166, 108, 28], CAP = [240, 206, 122], HONEY_DARK = [120, 66, 12];
const DECK = [40, 42, 47], WHITE = [212, 216, 222], GLASS = [34, 44, 58];
const LIGHT = {
  cell: [255, 178, 44], window: [150, 205, 255], bridge: [120, 190, 255], vent: [110, 200, 255],
  nozzle: [150, 205, 255], hangar: [255, 236, 200],
};
const SQ3 = Math.sqrt(3);

export function buildCarrierVoxels() {
  const { NX, NY, NZ } = CARRIER_SIZE;
  const N = NX * NY * NZ;
  const hp = new Uint8Array(N), colors = new Uint8Array(N * 3), tags = new Uint8Array(N);
  const lightAt = new Map(); // voxel index → light
  const id = (x, y, z) => (z * NY + y) * NX + x;
  const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < NX && y < NY && z < NZ;
  const solid = (x, y, z) => inside(x, y, z) && hp[id(x, y, z)] === 1;
  const set = (x, y, z, col, tag) => {
    if (!inside(x, y, z)) return;
    const i = id(x, y, z);
    hp[i] = 1; tags[i] = tag; lightAt.delete(i);
    colors[i * 3] = col[0]; colors[i * 3 + 1] = col[1]; colors[i * 3 + 2] = col[2];
  };
  const paint = (x, y, z, col) => { if (solid(x, y, z)) colors.set(col, id(x, y, z) * 3); };
  const clear = (x, y, z) => { if (inside(x, y, z)) { const i = id(x, y, z); hp[i] = 0; lightAt.delete(i); } };
  const light = (x, y, z, kind, tag, extra) => {
    if (!inside(x, y, z)) return;
    const i = id(x, y, z);
    hp[i] = 0; tags[i] = tag;
    lightAt.set(i, { x, y, z, color: LIGHT[kind], kind, ...extra });
  };
  const zc = NZ / 2 - 0.5;
  const jitter = (c, x, y, z) => { const k = Math.round((hash(x, y, z) - 0.5) * 12); return [c[0] + k, c[1] + k, c[2] + k]; };
  // the patchwork: blocks of 4 voxels in one of the greys (now and then yellow)
  const camo = (x, y, z, dark = 0) => {
    const h = hash(Math.floor(x / 4), Math.floor(y / 4), Math.floor(z / 4)) + dark;
    const c = h < 0.3 ? LIGHTP : h < 0.58 ? MIDP : h < 0.84 ? DARKP : h < 0.985 ? ANTH : YEL;
    return jitter(c, x, y, z);
  };

  // --- the hull: a long box, its lower edges chamfered, the bow rounded in plan --------------
  const X0 = 30, XB = 218, XE = 234, TOP = 40, BOT = 8, HW = 30;
  const halfWidth = (x, y) => {
    let w = HW;
    if (x > XB) { const r = XE - XB, dx = x - XB; if (dx >= r) return -1; w -= r - Math.sqrt(r * r - dx * dx); }
    if (y < 20) w *= 0.72 + 0.28 * ((y - BOT) / 12);
    if (y >= TOP - 2) w -= 1; // (a chamfer along the deck's edges)
    return w;
  };
  for (let x = X0; x < XE; x++) for (let y = BOT; y < TOP; y++) {
    const w = halfWidth(x, y);
    if (w < 0) continue;
    for (let z = 0; z < NZ; z++) if (Math.abs(z - zc) <= w) set(x, y, z, camo(x, y, z), TAG.hull);
  }

  // --- the engine block at the stern: wider and taller, darker ------------------------------
  for (let x = 6; x < X0 + 4; x++) for (let y = 6; y < 47; y++) {
    const w = y >= 44 ? 30 : y < 10 ? 29 : 32;
    for (let z = 0; z < NZ; z++) if (Math.abs(z - zc) <= w) set(x, y, z, camo(x, y, z, 0.18), TAG.engines);
  }
  // ribs round it every 6 voxels
  for (let x = 8; x < X0 + 4; x += 6) for (let y = 6; y < 47; y++) for (let z = 0; z < NZ; z++) {
    if (solid(x, y, z) && (!solid(x, y + 1, z) || !solid(x, y, z - 1) || !solid(x, y, z + 1) || !solid(x, y - 1, z))) paint(x, y, z, ANTH);
  }
  // four nozzles, two pairs: dark housings, light rims, their throats glowing
  const nozzles = [];
  for (const y of [17, 35]) for (const dz of [-14, 14]) nozzles.push({ y, z: zc + dz, r: 8.5 });
  for (const n of nozzles) for (let x = 0; x <= 10; x++) for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++) {
    const r = Math.hypot(y - n.y, z - n.z);
    if (r > n.r) continue;
    const throat = r < n.r - 2.5;
    if (!throat) { if (x < 10) set(x, y, z, x < 2 ? LIGHTP : r > n.r - 1 ? ANTH : DARKP, TAG.engines); }
    else if (x < 9) clear(x, y, z);
    else if (x === 9) light(x, y, z, 'nozzle', TAG.engines);
  }

  // --- the hangar bay: a mouth in the bow, a lit hall behind it --------------------------
  const HG = { x0: 176, y0: 14, y1: 31, hz: 17 };
  for (let x = HG.x0 - 4; x < XE; x++) for (let y = HG.y0 - 2; y <= HG.y1 + 2; y++) for (let z = 0; z < NZ; z++) {
    if (Math.abs(z - zc) > HG.hz + 2 || !solid(x, y, z)) continue;
    tags[id(x, y, z)] = TAG.hangar;
  }
  for (let x = HG.x0; x < XE; x++) for (let y = HG.y0; y <= HG.y1; y++) for (let z = 0; z < NZ; z++) {
    if (Math.abs(z - zc) <= HG.hz) clear(x, y, z);
  }
  // inside: light walls, a floor with yellow lines, rows of lamps in the ceiling
  for (let x = HG.x0 - 1; x < XE; x++) for (let y = HG.y0 - 1; y <= HG.y1 + 1; y++) for (let z = 0; z < NZ; z++) {
    if (!solid(x, y, z) || Math.abs(z - zc) > HG.hz + 1) continue;
    const floor = y === HG.y0 - 1, line = floor && (Math.abs(Math.abs(z - zc) - 9) < 0.6 || Math.abs(z - zc) < 0.6);
    paint(x, y, z, line ? YEL : floor ? MIDP : jitter(LIGHTP, x, y, z));
  }
  for (let x = HG.x0 + 2; x < XB + 4; x += 5) for (const dz of [-10, -5, 0, 5, 10]) light(x, HG.y1 + 1, Math.round(zc + dz), 'hangar', TAG.hangar);
  for (let y = HG.y0 + 2; y < HG.y1; y += 4) for (const dz of [-12, -4, 4, 12]) light(HG.x0 - 1, y, Math.round(zc + dz), 'hangar', TAG.hangar);
  // the bow's face round the mouth: honeycomb
  let comb = 0;
  for (let y = BOT; y < TOP - 1; y++) for (let z = 0; z < NZ; z++) {
    let x = XE - 1;
    while (x > XB - 20 && !solid(x, y, z)) x--;
    if (x <= XB - 20 || x < HG.x0) continue;
    const c = hexCell(z - zc, y - 22, 2.7, false);
    const i = id(x, y, z);
    tags[i] = TAG.hangar;
    const key = c.i * 97 + c.j;
    if (c.d > 0.74) colors.set(GOLD_LINE, i * 3);
    else if (hash(c.i, c.j, 7) < 0.3 && c.d < 0.45 && Math.abs(z - zc) > HG.hz + 1) light(x, y, z, 'cell', TAG.hangar, { cell: 100 + (key & 31) });
    else colors.set(hash(c.i, c.j, 3) < 0.5 ? YEL : GOLD, i * 3);
    comb++;
  }

  // --- the honeycomb modules along both sides ------------------------------------------------
  const hives = [];
  for (const side of [-1, 1]) for (let k = 0; k < 9; k++) hives.push({ side, cx: 50 + k * 14.5, cy: 22, r: 8, n: hives.length });
  for (const h of hives) {
    for (let x = Math.floor(h.cx - h.r); x <= Math.ceil(h.cx + h.r); x++) for (let y = Math.floor(h.cy - h.r); y <= Math.ceil(h.cy + h.r); y++) {
      const dx = x - h.cx, dy = y - h.cy;
      if (!inPointy(dx, dy, h.r)) continue;
      const z0 = outerZ(x, y, h.side);
      if (z0 === null) continue;
      // standing out from the hull's widest plane (flat faces even where the hull narrows below)
      const ring = !inPointy(dx, dy, h.r - 1.6), plane = Math.round(zc + h.side * HW);
      const face = plane + h.side * (ring ? 2 : 3), depth = (face - z0) * h.side;
      for (let d = 1; d <= depth; d++) {
        const z = z0 + h.side * d, outer = d === depth;
        if (!outer) { set(x, y, z, GOLD_LINE, TAG.hive); continue; }
        if (ring) { set(x, y, z, ANTH, TAG.hive); continue; }
        // the face: small cells of yellow and gold with dark walls, some glowing
        const c = hexCell(x - h.cx, y - h.cy, 2.4, true);
        if (c.d > 0.72) set(x, y, z, GOLD_LINE, TAG.hive);
        else if (hash(c.i + h.n * 31, c.j, 11) < 0.28 && c.d < 0.5) light(x, y, z, 'cell', TAG.hive, { cell: h.n });
        else set(x, y, z, jitter(hash(c.i + h.n * 31, c.j, 5) < 0.5 ? YEL : GOLD, x, y, z), TAG.hive);
      }
    }
  }

  // --- the reactor amidships: its vents glow along both sides --------------------------------
  for (let x = 112; x <= 140; x++) for (let y = BOT; y < TOP - 1; y++) for (let z = 0; z < NZ; z++) {
    if (solid(x, y, z) && tags[id(x, y, z)] === TAG.hull) tags[id(x, y, z)] = TAG.reactor;
  }
  for (let x = 113; x <= 139; x += 3) for (let y = 32; y <= 36; y++) for (const side of [-1, 1]) {
    const z = outerZ(x, y, side);
    if (z !== null) light(x, y, z, 'vent', TAG.reactor);
  }

  // --- windows down both sides (blue-white; a few dark), orange details --------------------
  for (let x = 38; x < XB; x += 3) for (const side of [-1, 1]) {
    if (x >= 111 && x <= 141) continue;
    for (const y of [11, 34]) {
      const z = outerZ(x, y, side);
      if (z === null || tags[id(x, y, z)] !== TAG.hull) continue;
      if (hash(x, y, side + 5) < 0.85) light(x, y, z, 'window', TAG.hull);
      else set(x, y, z, GLASS, TAG.hull);
    }
    if (hash(x, 1, side) < 0.12) { const z = outerZ(x, 37, side); if (z !== null && tags[id(x, 37, z)] === TAG.hull) paint(x, 37, z, ORANGE); }
  }

  // --- the flight deck: dark (no runway: honeycomb grows over it, see below), the edge in blocks ---
  for (let x = X0 + 4; x < XE; x++) for (let z = 0; z < NZ; z++) {
    const y = TOP - 1;
    if (!solid(x, y, z)) continue;
    set(x, y, z, Math.abs(z - zc) > 27.5 ? camo(x, y, z) : jitter(DECK, x, y, z), TAG.deck);
  }
  for (let x = X0 + 4; x < XB; x++) for (let z = 0; z < NZ; z++) {
    if (Math.abs(z - zc) < 28.5 || !solid(x, TOP - 1, z)) continue;
    if (hash(Math.floor(x / 4), 9, z) < 0.55) set(x, TOP, z, camo(x, TOP, z), TAG.hull);
  }
  // a few ships parked on the deck, noses towards the bow
  const parked = [[125, zc - 12], [155, zc - 12], [185, zc - 12], [170, zc + 12]];
  for (const [px, pz] of parked) {
    const z0 = Math.round(pz);
    for (let x = px - 4; x <= px + 4; x++) for (let z = z0 - 1; z <= z0 + 1; z++) set(x, TOP, z, x === px + 4 ? YEL : MIDP, TAG.deck);
    for (let x = px - 2; x <= px + 1; x++) for (let z = z0 - 4; z <= z0 + 4; z++) if (Math.abs(z - z0) > 1) set(x, TOP, z, Math.abs(z - z0) === 4 ? YEL : LIGHTP, TAG.deck);
    for (let x = px - 1; x <= px + 2; x++) set(x, TOP + 1, z0, LIGHTP, TAG.deck);
    set(px - 4, TOP + 1, z0, DARKP, TAG.deck);
    set(px - 4, TOP + 2, z0, DARKP, TAG.deck);
  }

  // --- the command tower: tiers stepping in, windows in bands, antennas ---------------------
  const tz = zc + 8;
  const tiers = [
    { x0: 64, x1: 112, y0: TOP, y1: 47, hz: 13, win: 44 },
    { x0: 70, x1: 106, y0: 47, y1: 53, hz: 10, win: 50 },
    { x0: 76, x1: 100, y0: 53, y1: 58, hz: 8, win: 55, bridge: true },
    { x0: 82, x1: 94, y0: 58, y1: 60, hz: 5 },
  ];
  for (const t of tiers) {
    for (let x = t.x0; x <= t.x1; x++) for (let y = t.y0; y < t.y1; y++) for (let z = 0; z < NZ; z++) {
      if (Math.abs(z - tz) > t.hz) continue;
      set(x, y, z, camo(x, y, z), TAG.bridge);
    }
    if (t.win === undefined) continue;
    for (let x = t.x0; x <= t.x1; x++) for (let z = 0; z < NZ; z++) {
      const edgeX = x === t.x0 || x === t.x1, edgeZ = Math.abs(Math.abs(z - tz) - t.hz) < 0.6;
      if (Math.abs(z - tz) > t.hz + 0.4 || !(edgeX || edgeZ)) continue;
      if (t.bridge) { light(x, t.win, z, 'bridge', TAG.bridge); light(x, t.win + 1, z, 'bridge', TAG.bridge); }
      else if ((x + z) % 2 === 0) light(x, t.win, z, 'window', TAG.bridge);
    }
  }
  const masts = [[86, tz, 63], [92, tz - 4, 62], [80, tz + 4, 61], [97, tz + 3, 61], [89, tz + 5, 62]];
  for (const [mx, mz, top] of masts) for (let y = 60; y <= top; y++) set(mx, y, Math.round(mz), y === top ? ORANGE : LIGHTP, TAG.sensors);
  for (let x = 84; x <= 90; x++) set(x, 61, Math.round(tz), LIGHTP, TAG.sensors);

  // --- the deck overgrown: honeycomb grown over it like wax in a wild hive — patches of different
  // heights flowing into each other, bare deck between them; cells capped with light wax, filled with
  // glowing honey, or open and dark; older wax darker at the bottom
  const blobs = [];
  for (let k = 0; k < 18; k++) blobs.push({ x: 40 + hash(k, 1, 21) * 186, z: zc + (hash(k, 2, 21) - 0.5) * 46, r: 7 + hash(k, 3, 21) * 15, h: 2 + hash(k, 4, 21) * 6, k });
  const growth = (x, z) => {
    let g = 0;
    for (const b of blobs) {
      const dx = x - b.x, dz = z - b.z, a = Math.atan2(dz, dx);
      // a wobbly outline, not a circle
      const r = b.r * (1 + 0.22 * Math.sin(a * 3 + b.k) + 0.12 * Math.sin(a * 5 + b.k * 2));
      const t = 1 - (dx * dx + dz * dz) / (r * r);
      if (t > 0) g = Math.max(g, b.h * Math.sqrt(t));
    }
    return g;
  };
  let combCells = 0;
  const seen = new Set();
  for (let x = X0 + 6; x < XB + 8; x++) for (let z = 0; z < NZ; z++) {
    if (Math.abs(z - zc) > 27 || !solid(x, TOP - 1, z) || solid(x, TOP, z)) continue; // (not under the tower or a ship)
    const c = hexCell(x - X0, z - zc, 2.3, false), key = c.i * 1000 + c.j;
    const H = Math.floor(growth(x, z) + (hash(c.i, c.j, 41) - 0.5) * 1.4);
    if (H < 1) continue;
    if (!seen.has(key)) { seen.add(key); combCells++; }
    const wall = c.d > 0.6, kind = hash(c.i, c.j, 43);
    for (let y = TOP; y < TOP + H; y++) {
      const old = y < TOP + Math.min(2, H - 1);
      if (wall) { set(x, y, z, jitter(old ? WAX_OLD : WAX, x, y, z), TAG.deck); continue; }
      if (H === 1) break; // (a thin crust: only the walls have grown)
      const top = y === TOP + H - 1;
      if (!top) { set(x, y, z, HONEY_DARK, TAG.deck); continue; }
      if (kind < 0.4) set(x, y, z, jitter(CAP, x, y, z), TAG.deck);                        // capped
      else if (kind < 0.7) light(x, y, z, 'cell', TAG.deck, { cell: 200 + (key & 63) });    // honey, glowing
      else { clear(x, y, z); if (H > 2) clear(x, y - 1, z); }                              // open, dark inside
    }
  }

  // --- the refinery: three tanks under the keel ---------------------------------------
  const tanks = [{ dz: -9, col: [70, 120, 190] }, { dz: 0, col: [190, 90, 40] }, { dz: 9, col: [170, 140, 205] }];
  for (const t of tanks) for (let x = 78; x <= 152; x++) for (let y = 1; y < BOT + 1; y++) for (let z = 0; z < NZ; z++) {
    const r = Math.hypot(y - 4.5, z - (zc + t.dz));
    if (r > 3.6 || solid(x, y, z)) continue;
    set(x, y, z, (x - 78) % 12 === 0 ? LIGHTP : jitter(t.col, x, y, z), TAG.refinery);
  }

  // running lights
  const beacons = [
    { x: XE - 3, y: TOP + 1, z: zc - 26, color: [255, 255, 255], period: 1.6 },
    { x: XE - 3, y: TOP + 1, z: zc + 26, color: [255, 255, 255], period: 1.6 },
    { x: 3, y: 47, z: 4, color: [255, 60, 50], period: 2.2 },
    { x: 3, y: 47, z: NZ - 5, color: [60, 255, 120], period: 2.2 },
    { x: 86, y: 63.5, z: tz, color: [255, 70, 60], period: 1.2 },
  ];

  return { NX, NY, NZ, hp, colors, tags, lights: [...lightAt.values()], beacons, nozzles, hives: hives.length, comb, combCells };

  /** The outermost solid voxel on the port (−1) or starboard (+1) side at (x, y), or null. */
  function outerZ(x, y, side) {
    if (side < 0) { for (let z = 0; z < NZ; z++) if (solid(x, y, z)) return z; }
    else for (let z = NZ - 1; z >= 0; z--) if (solid(x, y, z)) return z;
    return null;
  }
}

/** 0 … 1 from three integers (the same numbers, the same value). */
function hash(a, b, c) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Inside a hexagon with a corner up (pointy), radius r, at (dx, dy) from its centre. */
function inPointy(dx, dy, r) {
  return Math.abs(dx) <= (r * SQ3) / 2 && Math.abs(dy) + Math.abs(dx) / SQ3 <= r;
}

/**
 * Which cell of a honeycomb of radius r the point (u, v) is in: { i, j } (the cell) and d (0 at its
 * centre … 1 at its wall). `pointy`: corners up (else flat tops).
 */
function hexCell(u, v, r, pointy) {
  // axial coordinates (pointy: q along u; flat: q along v), rounded to the nearest cell
  const [a, b] = pointy ? [u, v] : [v, u];
  const q = ((SQ3 / 3) * a - (1 / 3) * b) / r, s = ((2 / 3) * b) / r;
  let x = q, z = s, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const ex = Math.abs(rx - x), ey = Math.abs(ry - y), ez = Math.abs(rz - z);
  if (ex > ey && ex > ez) rx = -ry - rz; else if (ey > ez) ry = -rx - rz; else rz = -rx - ry;
  const ca = r * SQ3 * (rx + rz / 2), cb = r * 1.5 * rz;
  const da = a - ca, db = b - cb;
  const d = Math.max(Math.abs(da) / ((r * SQ3) / 2), (Math.abs(db) + Math.abs(da) / SQ3) / r);
  return { i: rx, j: rz, d };
}
