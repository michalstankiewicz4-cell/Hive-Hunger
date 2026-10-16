/**
 * Steering helpers for the swarm: flying around the planet instead of through it, and whether a
 * voxel a unit touched is next to its own bite.
 */

export function nearOwnBite(cell, foodPos, i3, maxDist) {
  const dx = cell.x - foodPos[i3], dy = cell.y - foodPos[i3 + 1], dz = cell.z - foodPos[i3 + 2];
  return dx * dx + dy * dy + dz * dz <= maxDist * maxDist;
}

/**
 * If the straight path from p to t passes through the planet (centre at the origin),
 * returns a waypoint over the surface, partway along the great circle towards t (or straight up
 * when the unit is down in a pit); otherwise null.
 */
export function aroundPlanet(px, py, pz, tx, ty, tz, R, cfg) {
  if (!(R > 0)) return null;
  const dx = tx - px, dy = ty - py, dz = tz - pz;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < cfg.minDistance * cfg.minDistance) return null;
  const s = Math.max(0, Math.min(1, -(px * dx + py * dy + pz * dz) / len2));
  const cx = px + dx * s, cy = py + dy * s, cz = pz + dz * s;
  const pl = Math.hypot(px, py, pz) || 1, tl = Math.hypot(tx, ty, tz) || 1;
  // blocked only when the path dips clearly deeper than both of its ends — i.e. it really
  // goes through the planet (a dive to the bottom of a crater is fine)
  if (Math.hypot(cx, cy, cz) > Math.min(pl, tl, R) - cfg.dipMargin) return null;

  let ux = px / pl, uy = py / pl, uz = pz / pl;
  // below the surface (in a pit it has dug): climb straight out first, the way it came in
  if (pl < R - cfg.pitDepth) return [ux * (R + cfg.altitude), uy * (R + cfg.altitude), uz * (R + cfg.altitude)];
  let mx = ux + tx / tl, my = uy + ty / tl, mz = uz + tz / tl;
  let ml = Math.hypot(mx, my, mz);
  if (ml < 1e-3) { mx = -uy; my = ux; mz = 0; ml = Math.hypot(mx, my, mz) || 1; } // opposite sides: any perpendicular
  mx /= ml; my /= ml; mz /= ml;
  // halfway between "above me" and the great-circle midpoint, at a safe altitude
  let wx = ux + mx, wy = uy + my, wz = uz + mz;
  const wl = Math.hypot(wx, wy, wz) || 1;
  const alt = Math.max(pl, R + cfg.altitude);
  return [(wx / wl) * alt, (wy / wl) * alt, (wz / wl) * alt];
}
