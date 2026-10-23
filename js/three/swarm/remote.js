/**
 * A multiplayer guest's copy of a swarm (positions from the host's snapshots), and the lists of
 * laser beams and storm bolts the host sends.
 */
export const RemoteSwarm = {
  /**
   * Multiplayer guest: show positions and headings received from the host instead of
   * simulating. Units move smoothly towards the received positions between updates.
   */
  setRemote(count, pos, dir, lasers = 0, beams = null, storms = 0, bolts = null, tugs = 0, tows = null, bombers = 0, orbs = 0, supports = 0, cleaners = 0, drills = 0, drilling = null, piercers = 0, snipers = 0, splashers = 0, boosters = 0, cutters = 0, cuts = null, siphons = 0, scoops = 0) {
    this.siphons = siphons;
    this.scoops = scoops;
    this.splashers = splashers;
    this.boosters = boosters;
    this.cutters = cutters;
    this.remoteCuts = cuts || [];
    this.piercers = piercers;
    this.snipers = snipers;
    this.bombers = bombers;
    this.orbs = orbs;
    this.supports = supports;
    this.cleaners = cleaners;
    this.drills = drills;
    this.remoteDrilling = drilling || [];
    this.remote = true;
    this.lasers = lasers;
    this.storms = storms;
    this.tugs = tugs;
    this.tows = tows || [];
    this.remoteBolts = bolts || [];
    this.firing.fill(0);
    if (beams) for (const [i, x, y, z] of beams) {
      if (i >= this.max) continue;
      this.firing[i] = 1;
      this.beamTo[i * 3] = x; this.beamTo[i * 3 + 1] = y; this.beamTo[i * 3 + 2] = z;
    }
    count = Math.min(count, this.max);
    if (count !== this.count) {
      for (let i = this.count; i < count; i++) {
        const i3 = i * 3;
        for (let a = 0; a < 3; a++) {
          this.pos[i3 + a] = pos[i3 + a];
          this.dir[i3 + a] = dir[i3 + a];
          this.look[i3 + a] = dir[i3 + a];
        }
      }
      this.count = count;
      this.mesh.count = count;
    }
    if (!this.remotePos || this.remotePos.length < count * 3) {
      this.remotePos = new Float32Array(this.max * 3);
    }
    this.remotePos.set(pos.subarray(0, count * 3));
    this.dir.set(dir.subarray(0, count * 3));
  },

  /** Multiplayer guest: one display step towards the last positions from the host. */
  followRemote(k) {
    if (!this.remotePos) return;
    this.stepWarp(true);
    const n = this.count * 3;
    for (let i = 0; i < n; i++) {
      if (this.warpT[(i / 3) | 0] > 0) continue; // jumping away here on its own
      const d = this.remotePos[i] - this.pos[i];
      // a big jump (e.g. a new planet or a respawn) snaps instead of sliding across the screen
      this.pos[i] = Math.abs(d) > 6 ? this.remotePos[i] : this.pos[i] + d * k;
    }
  },

  /** Storm ships firing now: [[unit, x, y, z, [side points…]], …] (on a guest: from the host). */
  stormList() {
    if (this.remote) return this.remoteBolts || [];
    const out = [];
    const end = Math.min(this.lasers + this.storms, this.count);
    for (let i = this.lasers; i < end; i++) {
      if (!(this.landed[i] && this.aimed[i] && this.food[i] >= 0)) continue;
      const i3 = i * 3, n = this.stormSideN[i] * 3;
      out.push([i, this.foodPos[i3], this.foodPos[i3 + 1], this.foodPos[i3 + 2], Array.from(this.stormSides.subarray(i * 6, i * 6 + n))]);
    }
    return out;
  },

  /** Cutters cutting now, with the ends of their row: [[unit, lx, ly, lz, rx, ry, rz], …] (a guest: from the host). */
  cutList() {
    if (this.remote) return this.remoteCuts || [];
    const out = [];
    const a = this.kindStart('cutters'), b = Math.min(this.count, a + this.cutters);
    for (let i = a; i < b; i++) {
      if (!this.cutOn[i] || this.hidden[i]) continue;
      const i3 = i * 3;
      out.push([i, this.cutL[i3], this.cutL[i3 + 1], this.cutL[i3 + 2], this.cutR[i3], this.cutR[i3 + 1], this.cutR[i3 + 2]]);
    }
    return out;
  },

  /** Units currently firing their laser, with the point they hit: [[unit, x, y, z], …] */
  beamList() {
    const out = [];
    // (laser ships and piercers; the unit says which)
    for (let i = 0; i < this.count; i++) {
      if (this.firing[i]) out.push([i, this.beamTo[i * 3], this.beamTo[i * 3 + 1], this.beamTo[i * 3 + 2]]);
    }
    return out;
  },
};
