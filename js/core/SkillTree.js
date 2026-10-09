/**
 * Upgrade tree. Points come from eating: 1 voxel = 1 point. Each node is bought once, needs its
 * parent, and adds its effect on top of the settings panel (the sliders stay as they are).
 *
 * Branches grow upwards from the core: Units, Speed, Power and Chain Lightning (which forks
 * into Arcs, Voltage and Capacitor). `angle` (degrees from straight up) and `depth` place a
 * node in the tree view; costs grow along a branch.
 *
 * To add an upgrade: add a node here (and, for a new kind of effect, handle it in `effects`).
 */

const chain = (branch, name, icon, angle, costs, effect, text, parent = 'core', startDepth = 1, key = false) =>
  costs.map((cost, n) => ({
    id: `${branch}${n + 1}`,
    branch,
    name: `${name} ${['I', 'II', 'III', 'IV', 'V'][n]}`,
    icon,
    key: key && n === 0,
    parent: n === 0 ? parent : `${branch}${n}`,
    depth: startDepth + n,
    angle,
    cost,
    effect,
    text,
  }));

export const BRANCHES = {
  core: { color: [255, 214, 92], label: 'Hive' },
  units: { color: [120, 255, 140], label: 'Units' },
  speed: { color: [255, 170, 60], label: 'Speed' },
  power: { color: [255, 90, 150], label: 'Power' },
  bolt: { color: [190, 140, 255], label: 'Chain lightning' },
  arcs: { color: [150, 200, 255], label: 'Arcs' },
  volt: { color: [255, 120, 255], label: 'Voltage' },
  cap: { color: [140, 255, 240], label: 'Capacitor' },
};

export const NODES = [
  { id: 'core', branch: 'core', name: 'Hive core', icon: 'core', key: true, parent: null, depth: 0, angle: 0, cost: 0,
    effect: {}, text: 'Where it all starts. Eat voxels to earn points — 1 voxel = 1 point.' },
  ...chain('units', 'Brood', 'units', -58, [40, 90, 180, 360, 700], { count: 10 }, '+10 units', 'core', 1, true),
  ...chain('speed', 'Wings', 'speed', -22, [40, 90, 180, 360, 700], { speed: 0.1 }, '+10% speed', 'core', 1, true),
  ...chain('power', 'Jaws', 'power', 22, [40, 90, 180, 360, 700], { power: 0.2 }, '+0.2 bite radius', 'core', 1, true),
  { id: 'bolt1', branch: 'bolt', name: 'Chain lightning', icon: 'bolt', key: true, parent: 'core', depth: 1.4, angle: 58, cost: 250,
    effect: { bolt: true },
    text: 'Every few seconds a lightning bolt jumps from drone to drone and weakens the voxels it passes through.' },
  ...chain('arcs', 'Arcs', 'arcs', 42, [150, 300, 600], { jumps: 2 }, '+2 jumps', 'bolt1', 2.6, true),
  ...chain('volt', 'Voltage', 'volt', 60, [150, 300, 600], { damage: 0.15 }, '+15% voxel strength drained', 'bolt1', 2.6, true),
  ...chain('cap', 'Capacitor', 'cap', 78, [150, 300, 600], { interval: -1 }, 'bolt 1 s more often', 'bolt1', 2.6, true),
];

export const NODE = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** Lightning before any upgrades. */
export const BOLT_BASE = { interval: 6, jumps: 4, damage: 0.25, range: 9 };

/** A player's tree: which nodes are bought and how many points were spent. */
export class SkillTree {
  constructor() {
    this.owned = new Set(['core']);
    this.spent = 0;
  }

  has(id) {
    return this.owned.has(id);
  }

  /** 'owned' | 'available' (parent owned) | 'locked' */
  state(id) {
    if (this.owned.has(id)) return 'owned';
    const n = NODE[id];
    return n && this.owned.has(n.parent) ? 'available' : 'locked';
  }

  /** Whether `points` are enough to buy node `id` now. */
  canBuy(id, points) {
    const n = NODE[id];
    return Boolean(n) && this.state(id) === 'available' && points >= n.cost;
  }

  buy(id, points) {
    if (!this.canBuy(id, points)) return false;
    this.owned.add(id);
    this.spent += NODE[id].cost;
    return true;
  }

  /** Everything bought, added up: bonuses for the swarm and the lightning (or null). */
  effects() {
    const e = { count: 0, speed: 0, power: 0 };
    let bolt = null;
    for (const id of this.owned) {
      const f = NODE[id].effect;
      if (f.count) e.count += f.count;
      if (f.speed) e.speed += f.speed;
      if (f.power) e.power += f.power;
      if (f.bolt) bolt = { ...BOLT_BASE };
    }
    if (bolt) {
      for (const id of this.owned) {
        const f = NODE[id].effect;
        if (f.jumps) bolt.jumps += f.jumps;
        if (f.damage) bolt.damage += f.damage;
        if (f.interval) bolt.interval += f.interval;
      }
    }
    e.bolt = bolt;
    return e;
  }

  toJSON() {
    return { owned: [...this.owned], spent: this.spent };
  }

  load({ owned, spent }) {
    this.owned = new Set(owned);
    this.spent = spent;
  }
}
