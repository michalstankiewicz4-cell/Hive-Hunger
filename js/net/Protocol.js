/**
 * Binary messages between the host and guests (see docs/MULTIPLAYER.md).
 * Control messages are JSON strings; the two big ones are binary:
 *
 * SNAPSHOT (type 1), host → guests, several times a second
 *   u8 type | f32 spin | u32 left | u8 bannerLen | banner (utf-8) | u8 players
 *   per player: u8 index | u8 home (0 none, 1 recall, 2 return) | u32 score | u32 planetScore
 *               | u16 wins | u16 count | count × (3 × i16 position) | count × (3 × i8 heading)
 *   u32 removed | removed × u32 voxel index
 *
 * PLANET (type 2), host → guest(s): a new planet, or the current one for a guest who joins
 *   u8 type | u32 seed | u16 level | u8 hasBits | [bits: 1 bit per voxel, 1 = still solid]
 */

export const SNAPSHOT = 1;
export const PLANET = 2;

const POS_SCALE = 100; // positions as int16 → ±327 world units at 0.01 precision
const DIR_SCALE = 127;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeSnapshot(game, removed) {
  const players = game.activePlayers();
  const banner = enc.encode(game.banner || '').subarray(0, 255);
  let size = 1 + 4 + 4 + 1 + banner.length + 1 + 4 + removed.length * 4;
  for (const p of players) size += 1 + 1 + 4 + 4 + 2 + 2 + p.swarm.count * 9;

  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, SNAPSHOT); o += 1;
  v.setFloat32(o, game.spin, true); o += 4;
  v.setUint32(o, game.planet.left, true); o += 4;
  v.setUint8(o, banner.length); o += 1;
  new Uint8Array(buf, o, banner.length).set(banner); o += banner.length;
  v.setUint8(o, players.length); o += 1;
  for (const p of players) {
    const s = p.swarm;
    v.setUint8(o, p.index); o += 1;
    v.setUint8(o, p.homeMode === 'recall' ? 1 : p.homeMode === 'return' ? 2 : 0); o += 1;
    v.setUint32(o, p.score, true); o += 4;
    v.setUint32(o, p.planetScore, true); o += 4;
    v.setUint16(o, p.wins, true); o += 2;
    v.setUint16(o, s.count, true); o += 2;
    for (let i = 0; i < s.count * 3; i++) {
      v.setInt16(o, Math.max(-32767, Math.min(32767, Math.round(s.pos[i] * POS_SCALE))), true); o += 2;
    }
    for (let i = 0; i < s.count * 3; i++) {
      v.setInt8(o, Math.round(s.dir[i] * DIR_SCALE)); o += 1;
    }
  }
  v.setUint32(o, removed.length, true); o += 4;
  for (const idx of removed) { v.setUint32(o, idx, true); o += 4; }
  return buf;
}

export function decodeSnapshot(buf) {
  const v = new DataView(buf);
  let o = 1;
  const spin = v.getFloat32(o, true); o += 4;
  const left = v.getUint32(o, true); o += 4;
  const bl = v.getUint8(o); o += 1;
  const banner = dec.decode(new Uint8Array(buf, o, bl)); o += bl;
  const n = v.getUint8(o); o += 1;
  const players = [];
  for (let k = 0; k < n; k++) {
    const index = v.getUint8(o); o += 1;
    const home = v.getUint8(o); o += 1;
    const score = v.getUint32(o, true); o += 4;
    const planetScore = v.getUint32(o, true); o += 4;
    const wins = v.getUint16(o, true); o += 2;
    const count = v.getUint16(o, true); o += 2;
    const pos = new Float32Array(count * 3);
    const dir = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) { pos[i] = v.getInt16(o, true) / POS_SCALE; o += 2; }
    for (let i = 0; i < count * 3; i++) { dir[i] = v.getInt8(o) / DIR_SCALE; o += 1; }
    players.push({ index, home, score, planetScore, wins, count, pos, dir });
  }
  const nr = v.getUint32(o, true); o += 4;
  const removed = new Uint32Array(nr);
  for (let i = 0; i < nr; i++) { removed[i] = v.getUint32(o, true); o += 4; }
  return { spin, left, banner, players, removed };
}

export function encodePlanet(planet, level, withBits) {
  const bits = withBits ? planet.solidBits() : null;
  const buf = new ArrayBuffer(1 + 4 + 2 + 1 + (bits ? bits.length : 0));
  const v = new DataView(buf);
  v.setUint8(0, PLANET);
  v.setUint32(1, planet.seed >>> 0, true);
  v.setUint16(5, level, true);
  v.setUint8(7, bits ? 1 : 0);
  if (bits) new Uint8Array(buf, 8).set(bits);
  return buf;
}

export function decodePlanet(buf) {
  const v = new DataView(buf);
  const seed = v.getUint32(1, true);
  const level = v.getUint16(5, true);
  const bits = v.getUint8(7) ? new Uint8Array(buf.slice(8)) : null;
  return { seed, level, bits };
}
