import { CONFIG, SHIP_KINDS } from '../../config.js';

/**
 * Points, buying upgrades and what they add on top of the sliders, chain lightning.
 * (Part of Player: these become its methods.)
 */
export const Upgrades = {
  /** Points to spend in the upgrade tree: 1 eaten voxel = 1 point. */
  get points() {
    return this.score - this.tree.spent;
  },

  /** Buys an upgrade with this player's points; false if it isn't available or affordable. */
  buy(id) {
    if (!this.tree.buy(id, this.points)) return false;
    this.applyUpgrades();
    return true;
  },

  /** The swarm's units by type: as many of each as set (SHIP_KINDS order), as far as they go; the rest eat. */
  splitKinds() {
    const s = this.swarm;
    let left = s.count;
    for (const k of SHIP_KINDS) {
      s[k] = Math.max(0, Math.min(this[k], left));
      left -= s[k];
    }
  },

  /** Slider values plus the bonuses of everything bought in the tree. */
  applyUpgrades() {
    const e = this.tree.effects();
    const s = this.swarm;
    const count = Math.min(CONFIG.swarm.maxCount, Math.round(this.base.count + e.count));
    if (count !== s.count) s.setCount(count);
    this.splitKinds();
    s.speed = this.base.speed * (1 + e.speed);
    this.biteRadius = this.base.power + e.power;
    this.drillRadius = this.biteRadius * CONFIG.swarm.drill.power;
    this.bolt = e.bolt;
  },

  /**
   * Chain lightning: from a random drone it jumps to the nearest drone it hasn't hit yet
   * (within `range`), `jumps` times; every voxel on its way loses `damage` of its strength.
   */
  updateLightning() {
    if (!this.bolt) return;
    this.boltClock += 1 / 60;
    if (this.boltClock < this.bolt.interval) return;
    this.boltClock = 0;
    const s = this.swarm, pos = s.pos, n = s.count;
    if (n < 2) return;
    const hit = new Uint8Array(n);
    let cur = (Math.random() * n) | 0;
    hit[cur] = 1;
    const path = [pos[cur * 3], pos[cur * 3 + 1], pos[cur * 3 + 2]];
    const r2 = this.bolt.range * this.bolt.range;
    for (let j = 0; j < this.bolt.jumps; j++) {
      let best = -1, bestD = r2;
      const x = pos[cur * 3], y = pos[cur * 3 + 1], z = pos[cur * 3 + 2];
      for (let i = 0; i < n; i++) {
        if (hit[i]) continue;
        const d = (pos[i * 3] - x) ** 2 + (pos[i * 3 + 1] - y) ** 2 + (pos[i * 3 + 2] - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) break;
      hit[best] = 1;
      cur = best;
      path.push(pos[cur * 3], pos[cur * 3 + 1], pos[cur * 3 + 2]);
    }
    if (path.length < 6) return;
    this.game.planet.weakenAlong(path, this.bolt.damage);
    this.game.showBolt(this, path);
  },
};
