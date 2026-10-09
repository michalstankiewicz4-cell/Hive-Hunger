import { fbm3 } from './noise.js';
import { mix } from './terrain.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Kolor mgławicy (0–255, do dodania do tła) w punkcie przestrzeni.
 * W 2D próbkowane na płaszczyźnie, w 3D na sferze nieba.
 */
export function nebulaColor(x, y, z, seed, cfg) {
  const k = cfg.scale;
  const n = fbm3(x * k + 3, y * k + 3, z * k + 3, seed, cfg.octaves);
  const density = Math.pow(clamp01((n - cfg.threshold) / (1 - cfg.threshold)), cfg.falloff) * cfg.intensity;
  if (density <= 0) return null;
  const t = fbm3(x * k * 0.6 + 40, y * k * 0.6 + 40, z * k * 0.6 + 40, seed + 17, 3);
  const [a, b, c] = cfg.colors;
  const base = t < 0.5 ? mix(a, b, clamp01(t * 2)) : mix(b, c, clamp01(t * 2 - 1));
  return [base[0] * density, base[1] * density, base[2] * density];
}

/** Losowy kolor gwiazdy: od chłodnobiałej po ciepłożółtą. */
export function starColor() {
  const tints = [[200, 215, 255], [235, 240, 255], [255, 245, 225], [255, 225, 190], [180, 200, 255]];
  return tints[(Math.random() * tints.length) | 0];
}
