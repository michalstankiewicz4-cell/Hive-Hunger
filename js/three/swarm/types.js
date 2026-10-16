/**
 * Ship types by unit index (Swarm3D): units 0 … lasers−1 are laser ships, then storm ships, tugs,
 * bombers, orb ships and support ships; the rest are eaters. Their colours, and swapping two units
 * (a bomber that blew up is moved to the end to be removed).
 */
export const ShipTypes = {
  /** Units in red (lasers) and in the swarm's colour (eaters). */
  updateColors() {
    const n = Math.min(this.lasers, this.count), m = Math.min(n + this.storms, this.count), t = Math.min(m + this.tugs, this.count);
    const b = Math.min(t + this.bombers, this.count), o = Math.min(b + this.orbs, this.count), u = Math.min(o + this.supports, this.count);
    if (n === this.coloredLasers && m === this.coloredStorms && t === this.coloredTugs && b === this.coloredBombers
      && o === this.coloredOrbs && u === this.coloredSupports && this.colorsFor === this.count) return;
    this.coloredSupports = u;
    this.coloredBombers = b;
    this.coloredOrbs = o;
    this.coloredLasers = n;
    this.coloredStorms = m;
    this.coloredTugs = t;
    this.colorsFor = this.count;
    for (let i = 0; i < this.count; i++) {
      this.mesh.setColorAt(i, i < n ? this.laserColor : i < m ? this.stormColor : i < t ? this.tugColor : i < b ? this.bomberColor : i < o ? this.orbColor : i < u ? this.supportColor : this.baseColor);
    }
    this.mesh.instanceColor.needsUpdate = true;
  },

  /** Support ships among the units (after the orb ships). */
  isSupport(i) {
    const a = this.lasers + this.storms + this.tugs + this.bombers + this.orbs;
    return i >= a && i < a + this.supports;
  },

  isOrb(i) {
    const a = this.lasers + this.storms + this.tugs + this.bombers;
    return i >= a && i < a + this.orbs;
  },

  isBomber(i) {
    const a = this.lasers + this.storms + this.tugs;
    return i >= a && i < a + this.bombers;
  },

  /** Swaps everything about units a and b (a bomber that blew up is moved to the end to be removed). */
  swapUnits(a, b) {
    if (a === b) return;
    const swap = (arr, k) => {
      for (let j = 0; j < k; j++) { const t = arr[a * k + j]; arr[a * k + j] = arr[b * k + j]; arr[b * k + j] = t; }
    };
    for (const arr of [this.pos, this.dir, this.look, this.foodPos, this.beamTo, this.tugGoal]) swap(arr, 3);
    swap(this.stormSides, 6);
    for (const arr of [this.food, this.landed, this.redirect, this.best, this.stuck, this.lastBlock, this.blockAge,
      this.hungry, this.pause, this.firing, this.aimed, this.stormSideN, this.tugHas, this.orbOut, this.zapWait, this.hidden, this.warpDelay, this.warpT]) swap(arr, 1);
    swap(this.warpDir, 3);
    swap(this.warpFrom, 3);
    if (this.remotePos) swap(this.remotePos, 3);
  },

  isTug(i) {
    const a = this.lasers + this.storms;
    return i >= a && i < a + this.tugs;
  },

  /** Storm ships among the units (after the laser ships). */
  isStorm(i) {
    return i >= this.lasers && i < this.lasers + this.storms;
  },
};
