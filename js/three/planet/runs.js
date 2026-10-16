/**
 * Which voxels were eaten, as run lengths over the grid (a player joining mid-planet gets them).
 * (Part of VoxelPlanet: these become its methods.)
 */
export const EatenRuns = {
  /**
   * Which voxels have been eaten, for a guest who joins mid-planet (it builds the same planet
   * from the seed, so only the eaten ones are needed): run lengths over all voxel indices,
   * alternating "not eaten" / "eaten", starting with "not eaten", as varints. Eaten areas are
   * craters, so this stays small — a plain bitset of a large grid would not fit a WebRTC message.
   */
  eatenRuns() {
    const N = this.N, n = this.hp.length;
    const out = [];
    const put = (v) => { while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; } out.push(v); };
    let state = false, run = 0;
    for (let idx = 0; idx < n; idx++) {
      let eaten = false;
      if (this.hp[idx] <= 0 && !this.fragments?.has(idx)) {
        const i = idx % N, j = ((idx / N) | 0) % N, k = (idx / (N * N)) | 0;
        eaten = this.fill(i, j, k) > 0;
      }
      if (eaten !== state) { put(run); run = 0; state = eaten; }
      run++;
    }
    put(run);
    return new Uint8Array(out);
  },

  /** Removes the voxels listed as eaten in `runs` (from eatenRuns on the host). */
  applyEatenRuns(runs) {
    let p = 0, idx = 0, eaten = false;
    const n = this.hp.length;
    while (p < runs.length && idx < n) {
      let v = 0, shift = 0, b;
      do { b = runs[p++]; v |= (b & 127) << shift; shift += 7; } while (b & 128);
      if (eaten) for (let i = idx; i < idx + v && i < n; i++) if (this.hp[i] > 0) this.remove(i);
      idx += v;
      eaten = !eaten;
    }
    this.surface?.sync(true);
  },
};
