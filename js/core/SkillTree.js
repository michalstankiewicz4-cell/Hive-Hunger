/**
 * Upgrade tree. Points come from eating: 1 voxel = 1 point. Each node is bought once, needs its
 * parent, and adds its effect on top of the settings panel (the sliders stay as they are).
 *
 * The tree grows upwards from the core over five levels (rings): traits of the whole swarm (Brood,
 * Wings, Jaws, Agility, Chain lightning …), the ship types and their properties, with links across
 * branches. `angle` (degrees from straight up) and `depth` place a node in the tree view. For now only
 * the swarm's Brood, Wings, Jaws and the lightning work; the ships and their properties are shown as
 * "coming soon" (their logic comes later).
 *
 * To add an upgrade: add a node here (and, for a new kind of effect, handle it in `effects`).
 */

/*
 * Node fields: id, branch (its colour, see BRANCHES), kind — 'core', 'swarm' (a trait of the whole
 * swarm: a diamond), 'ship' (a ship type: a big hexagon), 'prop' (a property of a ship: a small circle) —
 * name, icon (swarm traits), parents (any one of them owned is enough; `all`: every one of them), depth
 * (the level ring, 0 … 5), angle (degrees from straight up), cost, effect, text. `soon`: shown, but its
 * upgrade isn't built yet (it can't be bought). The ships and their properties are all `soon` for now.
 */
const node = (id, branch, kind, name, depth, angle, parents, extra = {}) =>
  ({ id, branch, kind, name, depth, angle, parents, icon: null, cost: 0, effect: {}, text: '', soon: false, all: false, ...extra });
// a ship or one of its properties: shown, not built yet
const ship = (id, branch, name, depth, angle, parents, text, extra = {}) =>
  node(id, branch, 'ship', name, depth, angle, parents, { soon: true, text, ...extra });
const prop = (id, branch, name, depth, angle, parents, text, extra = {}) =>
  node(id, branch, 'prop', name, depth, angle, parents, { soon: true, text, ...extra });

export const BRANCHES = {
  core: { color: [255, 214, 92], label: 'Hive' },
  units: { color: [120, 255, 140], label: 'Units' },
  speed: { color: [255, 170, 60], label: 'Speed' },
  power: { color: [255, 90, 150], label: 'Power' },
  agile: { color: [255, 224, 138], label: 'Agility' },
  bolt: { color: [190, 140, 255], label: 'Chain lightning' },
  eaters: { color: [255, 216, 74], label: 'Eaters' },
  lasers: { color: [255, 74, 74], label: 'Lasers' },
  tugs: { color: [74, 255, 138], label: 'Tugs' },
  cleaners: { color: [154, 163, 173], label: 'Cleaners' },
  storms: { color: [74, 168, 255], label: 'Storms' },
  support: { color: [255, 255, 255], label: 'Support' },
  orbs: { color: [255, 74, 224], label: 'Orbs' },
  splashers: { color: [63, 125, 255], label: 'Splashers' },
  bombers: { color: [180, 90, 255], label: 'Bombers' },
  drills: { color: [255, 138, 31], label: 'Drills' },
  piercers: { color: [192, 112, 58], label: 'Piercers' },
  snipers: { color: [47, 224, 192], label: 'Snipers' },
  boosters: { color: [255, 95, 184], label: 'Boosters' },
};

export const NODES = [
  node('core', 'core', 'core', 'Hive core', 0, 0, [], { icon: 'core', text: 'Where it all starts. Eat voxels to earn points — 1 voxel = 1 point.' }),

  // the whole swarm (diamonds)
  node('units1', 'units', 'swarm', 'Brood I', 1, -62, ['core'], { icon: 'units', cost: 40, effect: { count: 10 }, text: '+10 units' }),
  node('units2', 'units', 'swarm', 'Brood II', 2, -74, ['units1'], { cost: 90, effect: { count: 10 }, text: '+10 units' }),
  node('units3', 'units', 'swarm', 'Brood III', 3.1, -80, ['units2'], { cost: 180, effect: { count: 10 }, text: '+10 units' }),
  node('speed1', 'speed', 'swarm', 'Wings I', 1, -30, ['core'], { icon: 'speed', cost: 40, effect: { speed: 0.1 }, text: '+10% speed' }),
  node('speed2', 'speed', 'swarm', 'Wings II', 2.1, -32, ['speed1'], { cost: 90, effect: { speed: 0.1 }, text: '+10% speed' }),
  node('agile1', 'agile', 'swarm', 'Agility', 3, -30, ['speed2'], { soon: true, text: 'Ships turn their noses faster.' }),
  node('sense1', 'agile', 'swarm', 'Swarm sense', 4.4, -32, ['agile1', 'd-wide'], { soon: true, text: 'Ships find their bites from further away.' }),
  node('power1', 'power', 'swarm', 'Jaws I', 1, 8, ['core'], { icon: 'power', cost: 40, effect: { power: 0.2 }, text: '+0.2 bite radius' }),
  node('power2', 'power', 'swarm', 'Jaws II', 2, 4, ['power1'], { cost: 90, effect: { power: 0.2 }, text: '+0.2 bite radius' }),
  node('power3', 'power', 'swarm', 'Jaws III', 3, -2, ['power2'], { cost: 180, effect: { power: 0.2 }, text: '+0.2 bite radius' }),
  node('bolt1', 'bolt', 'swarm', 'Chain lightning', 1.3, 64, ['core'], { icon: 'bolt', cost: 250, effect: { bolt: true },
    text: 'Every few seconds a lightning bolt jumps from drone to drone and weakens the voxels it passes through.' }),
  node('arcs1', 'bolt', 'swarm', 'Arcs', 2.5, 74, ['bolt1'], { icon: 'arcs', cost: 150, effect: { jumps: 2 }, text: '+2 jumps' }),
  node('volt1', 'bolt', 'swarm', 'Voltage', 3.5, 80, ['arcs1'], { icon: 'volt', cost: 300, effect: { damage: 0.15 }, text: '+15% voxel strength drained' }),
  node('cap1', 'bolt', 'swarm', 'Capacitor', 4.5, 76, ['volt1'], { icon: 'cap', cost: 600, effect: { interval: -1 }, text: 'bolt 1 s more often' }),

  // level 1: eaters (the starting ship), lasers, tugs
  ship('eaters', 'eaters', 'Eaters', 0.9, -10, ['core'], 'The starting ship: flies to the nearest voxel and eats it.'),
  prop('e-bite', 'eaters', 'Quick bite', 1.7, -16, ['eaters'], 'Eaters eat a voxel faster.'),
  prop('e-crater', 'eaters', 'Wide crater', 1.8, -6, ['eaters'], 'Eaters bite a wider crater.'),
  ship('lasers', 'lasers', 'Lasers', 1.1, 28, ['core'], 'Eat from a distance with a red beam.'),
  prop('l-range', 'lasers', 'Range', 1.9, 22, ['lasers'], 'Lasers fire from further away.'),
  prop('l-burn', 'lasers', 'Burn', 2.0, 32, ['lasers'], 'A hotter beam: lasers eat faster.'),
  prop('l-light', 'lasers', 'Light hull', 2.8, 27, ['l-range'], 'Lasers no longer fly slower.'),
  ship('tugs', 'tugs', 'Tugs', 1.2, -46, ['speed1'], 'Tow drifting pieces home with a tractor beam.'),
  prop('t-range', 'tugs', 'Tractor range', 1.9, -52, ['tugs'], 'The tractor beam catches pieces from further away.'),
  prop('t-pull', 'tugs', 'Pull speed', 2.0, -42, ['tugs'], 'Tugs tow faster.'),
  prop('t-bounty', 'tugs', 'Bounty ×7', 2.9, -50, ['t-range', 't-pull'], 'A towed piece is worth 7 × its points.', { all: true }),
  // level 2: cleaners, storms, support, orbs
  ship('cleaners', 'cleaners', 'Cleaners', 2.2, -62, ['tugs'], 'Eat only small drifting pieces.'),
  prop('c-size', 'cleaners', 'Bigger scraps', 3.0, -70, ['cleaners'], 'Cleaners take pieces of up to 6 voxels.'),
  prop('c-vac', 'cleaners', 'Vacuum', 3.4, -60, ['cleaners'], 'Cleaners pull small pieces in.'),
  ship('storms', 'storms', 'Storms', 2.2, 46, ['l-burn', 'bolt1'], 'Lightning that forks into three.'),
  prop('s-fork', 'storms', 'Fourth fork', 3.0, 44, ['storms'], 'The lightning forks into four.'),
  prop('s-charge', 'storms', 'Charged core', 3.1, 52, ['storms'], 'More of the damage on the bite.'),
  ship('support', 'support', 'Support', 2.3, 62, ['bolt1'], 'A bolt jumps between your own ships.'),
  prop('u-jumps', 'support', 'More jumps', 3.1, 62, ['support'], 'The bolt jumps more times.'),
  prop('u-fast', 'support', 'Faster bolts', 3.6, 68, ['support', 'arcs1'], 'A bolt more often.'),
  ship('orbs', 'orbs', 'Orbs', 2.2, 14, ['power1', 'lasers'], 'A slow plasma orb that bursts.'),
  prop('o-blast', 'orbs', 'Burst radius', 2.9, 10, ['orbs'], 'A wider burst.'),
  prop('o-twin', 'orbs', 'Twin orbs', 3.0, 22, ['orbs'], 'Two orbs in flight at once.'),
  // level 3: splashers, drills
  ship('splashers', 'splashers', 'Splashers', 3.3, 6, ['o-blast', 'power3'], 'A bubble of liquid that soaks a block away.'),
  prop('p-area', 'splashers', 'Bigger soak', 4.0, 2, ['splashers'], 'A bigger block soaks.'),
  prop('p-quick', 'splashers', 'Quick soak', 4.1, 10, ['splashers'], 'The block is gone sooner.'),
  ship('drills', 'drills', 'Drills', 3.2, -14, ['e-crater', 'agile1'], 'Drill straight tunnels.'),
  prop('d-wide', 'drills', 'Wider bit', 3.9, -20, ['drills'], 'A wider tunnel.'),
  prop('d-fast', 'drills', 'Faster drill', 4.0, -10, ['drills'], 'Drills go in faster.'),
  // level 4: piercers, bombers, boosters
  ship('piercers', 'piercers', 'Piercers', 4.2, 20, ['l-light', 'd-fast'], 'Fire along a line until through.', { all: true }),
  prop('r-deep', 'piercers', 'Pierce 5', 4.9, 16, ['piercers'], '5 voxels at once instead of 3.'),
  prop('r-burn', 'piercers', 'Longer burn', 4.8, 25, ['piercers'], 'The beam keeps going longer once through.'),
  ship('bombers', 'bombers', 'Bombers', 4.3, 36, ['o-twin', 's-charge'], 'Blow up everything around, leaving a black hole.'),
  prop('b-blast', 'bombers', 'Blast radius', 5.0, 32, ['bombers'], 'A bigger blast.'),
  prop('b-hole', 'bombers', 'Long black hole', 5.0, 40, ['bombers'], 'The black hole stays longer.'),
  prop('b-live', 'bombers', 'Survivor', 4.6, 44, ['bombers'], 'A chance to survive its own blast.'),
  ship('boosters', 'boosters', 'Boosters', 4.2, -50, ['units3', 'c-vac'], 'A pink force field: more Power for ships inside.'),
  prop('x-field', 'boosters', 'Bigger field', 5.0, -54, ['boosters'], 'A bigger force field.'),
  prop('x-boost', 'boosters', '+35% Power', 5.0, -44, ['boosters'], 'Ships inside get +35% Power instead of +20%.'),
  // level 5: snipers
  ship('snipers', 'snipers', 'Snipers', 5.0, -2, ['r-deep', 'p-area'], 'From any distance: an accelerating shot.'),
  prop('n-charge', 'snipers', 'Quick charge', 5.0, -8, ['snipers'], 'Charges in 3 s instead of 5.'),
  prop('n-double', 'snipers', 'Double shot', 5.0, 5, ['snipers'], 'Two shots in a row.'),
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

  /** 'owned' | 'available' (a parent owned — every parent for `all`) | 'locked' | 'soon' (not built yet) */
  state(id) {
    if (this.owned.has(id)) return 'owned';
    const n = NODE[id];
    if (!n) return 'locked';
    if (n.soon) return 'soon';
    const ok = n.all ? n.parents.every((p) => this.owned.has(p)) : n.parents.some((p) => this.owned.has(p));
    return ok ? 'available' : 'locked';
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
      const f = NODE[id]?.effect || {};
      if (f.count) e.count += f.count;
      if (f.speed) e.speed += f.speed;
      if (f.power) e.power += f.power;
      if (f.bolt) bolt = { ...BOLT_BASE };
    }
    if (bolt) {
      for (const id of this.owned) {
        const f = NODE[id]?.effect || {};
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
