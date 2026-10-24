/**
 * A spatial hash for particles (droplets of liquid, puffs of gas): cells of size `h`, each particle
 * in the bucket of its cell (linked lists in typed arrays — no strings, nothing allocated per frame).
 * `near(i)` lists every later particle (j > i: each pair once) in the cells within `span` cells of particle i's
 * (`found`) — cells of half the reach, `span` 2, look at less empty space than whole-reach cells; buckets that
 * two cells share by chance are told apart by each particle's own cell, so nobody is counted twice.
 */
export class Grid3D {
  constructor(max, h, span = 1, buckets = 8192) {
    this.h = h;
    this.span = span;
    this.mask = buckets - 1; // (buckets: a power of two)
    this.head = new Int32Array(buckets);
    this.next = new Int32Array(max);
    this.cx = new Int32Array(max);
    this.cy = new Int32Array(max);
    this.cz = new Int32Array(max);
    this.found = new Int32Array(max);
  }

  bucket(x, y, z) {
    return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & this.mask;
  }

  /** Puts the first `n` particles of `P` (x, y, z, …) into their cells. */
  build(P, n) {
    const h = this.h;
    this.head.fill(-1);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(P[i * 3] / h), y = Math.floor(P[i * 3 + 1] / h), z = Math.floor(P[i * 3 + 2] / h);
      this.cx[i] = x; this.cy[i] = y; this.cz[i] = z;
      const b = this.bucket(x, y, z);
      this.next[i] = this.head[b];
      this.head[b] = i;
    }
  }

  /** The particles j > i in the cells around i: they are in `found`, returns how many. */
  near(i) {
    const x0 = this.cx[i], y0 = this.cy[i], z0 = this.cz[i], head = this.head, next = this.next, cx = this.cx, cy = this.cy, cz = this.cz, out = this.found;
    const r = this.span;
    let n = 0;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let d = -r; d <= r; d++) {
      const x = x0 + a, y = y0 + b, z = z0 + d;
      for (let j = head[this.bucket(x, y, z)]; j >= 0; j = next[j]) {
        if (j > i && cx[j] === x && cy[j] === y && cz[j] === z) out[n++] = j;
      }
    }
    return n;
  }
}
