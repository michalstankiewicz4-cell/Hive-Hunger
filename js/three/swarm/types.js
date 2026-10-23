import { SHIP_KINDS, kindConfig } from '../../config.js';

const THREE = window.THREE;

/**
 * Ship types by unit index (Swarm3D): the types in SHIP_KINDS come one after another — units
 * 0 … lasers−1 are laser ships, then storm ships, tugs, bombers, orb ships, support ships,
 * cleaners and drills; the rest are eaters. `this.lasers`, `this.storms`, … say how many of each. Their
 * colours, and swapping two units (a bomber that blew up is moved to the end to be removed).
 */
export const ShipTypes = {
  /** First unit of ship type `kind` (they come in SHIP_KINDS order). */
  kindStart(kind) {
    let a = 0;
    for (const k of SHIP_KINDS) {
      if (k === kind) return a;
      a += this[k];
    }
    return a;
  },

  /** Is unit i of ship type `kind`? */
  isKind(i, kind) {
    const a = this.kindStart(kind);
    return i >= a && i < a + this[kind];
  },

  /** `kindOf[i]`: unit i's type as an index in SHIP_KINDS, eaters = SHIP_KINDS.length (once per frame). */
  fillKinds() {
    if (!this.kindOf || this.kindOf.length < this.max) this.kindOf = new Uint8Array(this.max);
    let i = 0;
    SHIP_KINDS.forEach((k, n) => { for (const end = Math.min(this.count, i + this[k]); i < end; i++) this.kindOf[i] = n; });
    for (; i < this.count; i++) this.kindOf[i] = SHIP_KINDS.length;
  },

  isStorm(i) { return this.isKind(i, 'storms'); },
  isTug(i) { return this.isKind(i, 'tugs'); },
  isBomber(i) { return this.isKind(i, 'bombers'); },
  isOrb(i) { return this.isKind(i, 'orbs'); },
  isSupport(i) { return this.isKind(i, 'supports'); },
  isCleaner(i) { return this.isKind(i, 'cleaners'); },
  isDrill(i) { return this.isKind(i, 'drills'); },
  isPiercer(i) { return this.isKind(i, 'piercers'); },
  isSniper(i) { return this.isKind(i, 'snipers'); },
  isSplasher(i) { return this.isKind(i, 'splashers'); },
  isBooster(i) { return this.isKind(i, 'boosters'); },
  isCutter(i) { return this.isKind(i, 'cutters'); },
  isSiphon(i) { return this.isKind(i, 'siphons'); },

  /** Every unit in its type's colour (set again only when the split or the count changed). */
  updateColors() {
    const key = SHIP_KINDS.map((k) => this[k]).join(',') + '/' + this.count;
    if (key === this.colorsFor) return;
    this.colorsFor = key;
    this.kindColors ||= SHIP_KINDS.map((k) => new THREE.Color(this.cfg[kindConfig(k)].color));
    let i = 0;
    SHIP_KINDS.forEach((k, n) => {
      for (const end = Math.min(this.count, i + this[k]); i < end; i++) this.mesh.setColorAt(i, this.kindColors[n]);
    });
    for (; i < this.count; i++) this.mesh.setColorAt(i, this.baseColor);
    this.mesh.instanceColor.needsUpdate = true;
  },

  /** Swaps everything about units a and b (a bomber that blew up is moved to the end to be removed). */
  swapUnits(a, b) {
    if (a === b) return;
    const swap = (arr, k) => {
      for (let j = 0; j < k; j++) { const t = arr[a * k + j]; arr[a * k + j] = arr[b * k + j]; arr[b * k + j] = t; }
    };
    for (const arr of [this.pos, this.dir, this.look, this.foodPos, this.beamTo, this.tugGoal, this.drillDir, this.pierceDir, this.pierceEnd, this.cutDir, this.cutSide, this.cutL, this.cutR]) swap(arr, 3);
    swap(this.stormSides, 6);
    for (const arr of [this.food, this.landed, this.redirect, this.best, this.stuck, this.lastBlock, this.blockAge,
      this.hungry, this.pause, this.firing, this.aimed, this.stormSideN, this.tugHas, this.orbOut, this.splashOut, this.boosted, this.cutOn, this.cutPiece, this.cutAfter, this.cutBody, this.snipePhase, this.snipeT, this.zapWait, this.hidden, this.warpDelay, this.warpT, this.leaving,
      this.drillLeft, this.drillIdle, this.drillHit, this.drillAim, this.pierceOn, this.pierceAfter]) swap(arr, 1);
    swap(this.warpDir, 3);
    swap(this.warpFrom, 3);
    if (this.remotePos) swap(this.remotePos, 3);
  },
};
