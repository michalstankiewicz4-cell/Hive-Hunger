/**
 * The carrier's light that falls on its own hull, cheap and still alive.
 *
 * Its glowing voxels (windows, honey, the hangar, nozzles…) are put into at most MAX_GROUPS groups —
 * a row of windows, a patch of honey, the hangar, each pair of nozzles. When the carrier is built, how
 * much light each group throws on every vertex of the hull round it is worked out once (within `REACH`
 * voxels, facing the light, not hidden behind solid voxels) and kept on the vertex: its two strongest
 * groups, `aLitA` / `aLitB` (r, g, b, group). While it is drawn, every group has one number — its
 * brightness now (`intensity`, a uniform array) — so a group can pulse, flicker or go out, and the hull
 * round it darkens with it, at the price of a multiplication per vertex. No shadows, no light sources
 * computed per pixel (only a few real lights for the biggest glows — `REAL`).
 */

export const MAX_GROUPS = 64;
const REACH = 9;
const STRENGTH = { window: 0.22, bridge: 0.3, vent: 0.3, cell: 0.32, hangar: 0.55, nozzle: 0.8 };

/**
 * Group number of each light (`f`: the grid's voxels per drawn voxel, so a coarse grid's lights group the
 * same way; `keys` / `kinds`: the groups found so far — pass the full grid's so the numbers agree).
 */
export function groupLights(v, lights, f = 1, keys = new Map(), kinds = []) {
  const zc = v.NZ / 2;
  const of = lights.map((l) => {
    const X = l.x * f, Y = l.y * f, Z = l.z * f, side = Z < zc ? 0 : 1;
    let key;
    if (l.kind === 'nozzle') key = `n${Y < v.NY / 2 ? 0 : 1}`;
    else if (l.kind === 'hangar' || l.kind === 'bridge') key = l.kind;
    else if (l.kind === 'vent') key = `v${side}`;
    else if (l.kind === 'window') key = `w${side}${Math.floor(X / 40)}`;
    else if (l.cell >= 200) key = `d${side}${Math.floor(X / 40)}`; // (honey in the comb on the deck)
    else if (l.cell >= 100) key = 'bow';
    else key = `m${Math.floor((l.cell ?? 0) / 3)}`; // (the honeycomb modules on the sides, three by three)
    if (!keys.has(key)) { keys.set(key, Math.min(keys.size, MAX_GROUPS - 1)); kinds.push(l.kind); }
    return keys.get(key);
  });
  return { of, kinds, keys, count: Math.min(keys.size, MAX_GROUPS) };
}

/**
 * Works out the light every group throws on the hull's vertices (`geometries`: PlanetSurface's,
 * positions centred on the grid `v`, 1 unit per voxel) and adds `aLitA` / `aLitB` to them.
 */
export function bakeLight(geometries, v, lights, groupOf) {
  const { NX, NY, NZ, hp } = v;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < NX && y < NY && z < NZ && hp[(z * NY + y) * NX + x] === 1;
  // the sources: lights of a group close together merged (2 × 2 × 2 voxels as one, a bit stronger)
  const merged = new Map();
  lights.forEach((l, i) => {
    const g = groupOf[i], key = `${g}:${l.x >> 1},${l.y >> 1},${l.z >> 1}`;
    const s = merged.get(key) || { x: 0, y: 0, z: 0, n: 0, g, r: 0, gg: 0, b: 0, k: STRENGTH[l.kind] ?? 0.25 };
    s.x += l.x + 0.5; s.y += l.y + 0.5; s.z += l.z + 0.5; s.n++;
    s.r += l.color[0] / 255; s.gg += l.color[1] / 255; s.b += l.color[2] / 255;
    merged.set(key, s);
  });
  const sources = [...merged.values()].map((s) => ({ x: s.x / s.n, y: s.y / s.n, z: s.z / s.n, g: s.g, k: s.k * Math.min(2.2, Math.sqrt(s.n)), r: s.r / s.n, gg: s.gg / s.n, b: s.b / s.n }));
  // a spatial hash of the sources
  const cell = REACH, hash = new Map();
  for (const s of sources) {
    const key = `${Math.floor(s.x / cell)},${Math.floor(s.y / cell)},${Math.floor(s.z / cell)}`;
    (hash.get(key) || hash.set(key, []).get(key)).push(s);
  }
  const acc = new Float32Array(MAX_GROUPS * 3), used = [];
  let lit = 0;
  for (const geo of geometries) {
    const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, n = P.length / 3;
    const A = new Float32Array(n * 4), B = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const nx = Nn[i * 3], ny = Nn[i * 3 + 1], nz = Nn[i * 3 + 2];
      // in voxel space (voxel i spans i … i + 1), a little off the surface
      const qx = P[i * 3] + NX / 2 + nx * 0.6, qy = P[i * 3 + 1] + NY / 2 + ny * 0.6, qz = P[i * 3 + 2] + NZ / 2 + nz * 0.6;
      const cx = Math.floor(qx / cell), cy = Math.floor(qy / cell), cz = Math.floor(qz / cell);
      used.length = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const list = hash.get(`${cx + a},${cy + b},${cz + c}`);
        if (!list) continue;
        for (const s of list) {
          const dx = s.x - qx, dy = s.y - qy, dz = s.z - qz, d = Math.hypot(dx, dy, dz);
          if (d > REACH || d < 1e-3) continue;
          const facing = (dx * nx + dy * ny + dz * nz) / d;
          if (facing <= 0) continue;
          // hidden behind a solid voxel?
          let hidden = false;
          for (let t = 0.5; t < d - 0.8; t += 0.5) {
            if (solid(Math.floor(qx + (dx / d) * t), Math.floor(qy + (dy / d) * t), Math.floor(qz + (dz / d) * t))) { hidden = true; break; }
          }
          if (hidden) continue;
          const fall = (1 - d / REACH) ** 2 / (1 + 0.06 * d * d), w = s.k * facing * fall;
          const o = s.g * 3;
          if (acc[o] + acc[o + 1] + acc[o + 2] === 0) used.push(s.g);
          acc[o] += s.r * w; acc[o + 1] += s.gg * w; acc[o + 2] += s.b * w;
        }
      }
      if (!used.length) continue;
      // the two strongest groups stay on the vertex
      used.sort((g1, g2) => acc[g2 * 3] + acc[g2 * 3 + 1] + acc[g2 * 3 + 2] - (acc[g1 * 3] + acc[g1 * 3 + 1] + acc[g1 * 3 + 2]));
      for (let k = 0; k < Math.min(2, used.length); k++) {
        const g = used[k], T = k ? B : A;
        T[i * 4] = Math.min(1.2, acc[g * 3]); T[i * 4 + 1] = Math.min(1.2, acc[g * 3 + 1]); T[i * 4 + 2] = Math.min(1.2, acc[g * 3 + 2]); T[i * 4 + 3] = g;
      }
      for (const g of used) acc[g * 3] = acc[g * 3 + 1] = acc[g * 3 + 2] = 0;
      lit++;
    }
    geo.setAttribute('aLitA', new window.THREE.BufferAttribute(A, 4));
    geo.setAttribute('aLitB', new window.THREE.BufferAttribute(B, 4));
  }
  return { sources: sources.length, lit };
}

/** Zero light on geometries that are not baked (the map's small carrier). */
export function noLight(geometries) {
  for (const geo of geometries) {
    const n = geo.attributes.position.count;
    geo.setAttribute('aLitA', new window.THREE.BufferAttribute(new Float32Array(n * 4), 4));
    geo.setAttribute('aLitB', new window.THREE.BufferAttribute(new Float32Array(n * 4), 4));
  }
}

/**
 * The groups' brightness over time: windows go out now and then (a row at a time) and come back,
 * honey and the side modules breathe slowly, vents and nozzles pulse, the hangar and the bridge stay on.
 */
export function groupIntensity(kind, g, t) {
  const ph = g * 2.39996;
  if (kind === 'window') {
    // every 8 s a row of windows decides whether it is lit
    const slot = Math.floor(t / 8 + g * 0.37), off = hash01(g, slot) < 0.2;
    return off ? 0 : 1;
  }
  if (kind === 'nozzle') return 0.85 + 0.15 * Math.sin(t * 5.3 + ph) + 0.05 * Math.sin(t * 17 + ph);
  if (kind === 'vent') return 0.75 + 0.25 * Math.sin(t * 2.2 + ph);
  if (kind === 'cell') return 0.85 + 0.15 * Math.sin(t * 1.1 + ph);
  return 1;
}

function hash01(a, b) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
