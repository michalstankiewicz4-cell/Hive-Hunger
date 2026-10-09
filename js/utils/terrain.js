import { fbm3 } from './noise.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Nieoświetlony kolor terenu dla punktu na sferze jednostkowej (nx, ny, nz).
 * Wspólny dla trybu 2D i 3D.
 */
export function terrainColor(nx, ny, nz, seed, s) {
  const p = s.palette;
  const k = s.noiseScale;
  const h = fbm3(nx * k + 10, ny * k + 10, nz * k + 10, seed, s.octaves);

  let rgb;
  const above = h - s.seaLevel;
  if (above < 0) {
    rgb = mix(p.shallowOcean, p.deepOcean, clamp01(-above / 0.12));
  } else if (above < 0.006) {
    rgb = mix(p.beach, p.lowland, 0.35);
  } else if (above < 0.07) {
    rgb = mix(p.lowland, p.highland, (above - 0.006) / 0.064);
  } else if (above < 0.13) {
    rgb = mix(p.highland, p.mountain, (above - 0.07) / 0.06);
  } else {
    rgb = mix(p.mountain, p.snow, clamp01((above - 0.13) / 0.04));
  }

  // czapy polarne z poszarpaną krawędzią
  const wobble = (fbm3(nx * 6, ny * 6, nz * 6, seed + 7, 3) - 0.5) * 0.18;
  if (Math.abs(ny) + wobble > s.iceLatitude) rgb = p.ice;

  // chmury
  const c = s.clouds;
  const cl = fbm3(nx * c.scale + 50, ny * c.scale * 1.6 + 50, nz * c.scale + 50, seed + 999, 4);
  if (cl > c.threshold) rgb = mix(rgb, [255, 255, 255], clamp01((cl - c.threshold) / 0.08) * c.opacity);

  return rgb;
}
