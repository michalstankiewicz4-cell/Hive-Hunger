/** Constants of the voxel grid shared by the planet's files. */

/** What a bite did to a voxel. */
export const BITE = Object.freeze({ MISS: 0, HIT: 1, REMOVED: 2 });

/** The six face neighbours of a voxel. */
export const NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Offsets within 2 voxels, nearest first (for the storm ship's side bolts): [a, b, c, distance²]. */
export const AROUND = [];
for (let c = -2; c <= 2; c++) for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
  const d = a * a + b * b + c * c;
  if (d > 0 && d <= 4) AROUND.push([a, b, c, d]);
}
AROUND.sort((p, q) => p[3] - q[3]);
