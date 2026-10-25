import { SHIP_GROUPS, GROUP_KINDS } from '../../config.js';

const THREE = window.THREE;
const ATTACK = new Set(SHIP_GROUPS[0].kinds);

/**
 * Enemy ships round a planet (a level's `enemies`: Earth and the test board; single player only for now):
 * cones with a cockpit, as big as our ships, each on its own tilted circular orbit between the planet and
 * the tunnels. When one of our ships comes within `range` they fire at it — glowing red bolts that fly
 * straight to where the ship was; a hit costs it one of its `swarm.hp` lives (a red spark), the last one
 * and it is gone. Our attack ships (the ship bar's Attack group) fire back: within `swarm.gun.range`,
 * every `gun.cooldown` frames, a beam in their own colour that takes a life of the enemy (`hp`); the
 * last one and it bursts into debris.
 *
 * Distances are × the planet's scale (`base`: Earth's radius × Game3D.sizeScale), so the test board's
 * small balls get a smaller ring of enemies.
 */
export class Enemies {
  constructor(scene, cfg, gun) {
    this.cfg = cfg;
    this.gun = gun;
    this.list = [];
    this.bolts = [];
    this.beams = [];
    this.killed = 0; // (tests) enemies destroyed
    this.hits = 0;   // (tests) our ships hit
    const n = cfg.max;
    // the hull (a cone, its tip forward), the cockpit (a glass bubble on top) and an engine glow at the base
    const cone = new THREE.ConeGeometry(cfg.radius, cfg.length, 12);
    cone.rotateX(Math.PI / 2); // (tip along +z: forward, see lookAt)
    const glass = new THREE.SphereGeometry(cfg.radius * 0.55, 10, 8);
    glass.scale(1, 0.7, 1.3);
    glass.translate(0, cfg.radius * 0.55, -cfg.length * 0.05);
    const glow = new THREE.SphereGeometry(cfg.radius * 0.6, 8, 6);
    glow.translate(0, 0, -cfg.length * 0.52);
    const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
    this.hull = mk(cone, new THREE.MeshLambertMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity: 0.25 }));
    this.cockpit = mk(glass, new THREE.MeshBasicMaterial({ color: cfg.cockpit }));
    this.engine = mk(glow, new THREE.MeshBasicMaterial({ color: cfg.engine }));
    this.hull.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    // bolts (theirs) and beams (ours): short glowing lines, additive
    const lines = (count) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.frustumCulled = false;
      scene.add(l);
      return l;
    };
    this.boltLines = lines(256);
    this.beamLines = lines(256);
    this.m = new THREE.Object3D();
    this.boltColor = new THREE.Color(cfg.boltColor);
  }

  /** A new planet: `count` enemies on orbits `orbit` × `base` (0: none). */
  reset(count, base) {
    const c = this.cfg;
    this.base = base;
    this.list = [];
    this.bolts.length = 0;
    this.beams.length = 0;
    for (let k = 0; k < Math.min(count, c.max); k++) {
      // a tilted circle: two axes at right angles, a radius, a speed, where along it it starts
      const n = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const u = new THREE.Vector3(1, 0, 0).cross(n);
      if (u.lengthSq() < 1e-3) u.set(0, 1, 0).cross(n);
      u.normalize();
      const v = n.clone().cross(u);
      const r = base * (c.orbit[0] + Math.random() * (c.orbit[1] - c.orbit[0]));
      this.list.push({ u, v, r, a: Math.random() * Math.PI * 2, w: (c.speed / r) * (Math.random() < 0.5 ? 1 : -1),
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), hp: c.hp, wait: c.cooldown[0] + Math.random() * c.cooldown[1], flash: 0 });
    }
    this.draw();
  }

  clear() { this.reset(0, this.base || 1); }

  /** One frame: they fly round, fire at our ships within range; bolts fly and hit; our attack ships fire back. */
  update(players, debris) {
    const c = this.cfg, base = this.base || 1;
    // orbits
    for (const e of this.list) {
      e.a += e.w;
      const ca = Math.cos(e.a), sa = Math.sin(e.a);
      const x = (e.u.x * ca + e.v.x * sa) * e.r, y = (e.u.y * ca + e.v.y * sa) * e.r, z = (e.u.z * ca + e.v.z * sa) * e.r;
      e.vel.set(x - e.pos.x, y - e.pos.y, z - e.pos.z);
      e.pos.set(x, y, z);
      if (e.flash > 0) e.flash--;
    }
    // our ships that can be seen (out of the tunnel, not jumping away)
    const ships = [];
    for (const p of players) {
      const s = p.swarm;
      s.fillKinds();
      for (let i = 0; i < s.count; i++) {
        if (s.hidden[i] || s.warpT[i] > 0 || s.leaving[i]) continue;
        ships.push({ p, i, x: s.pos[i * 3], y: s.pos[i * 3 + 1], z: s.pos[i * 3 + 2], v: s.speed, dx: s.dir[i * 3], dy: s.dir[i * 3 + 1], dz: s.dir[i * 3 + 2], attack: ATTACK.has(GROUP_KINDS[s.kindOf[i]]) && GROUP_KINDS[s.kindOf[i]] !== 'eaters' });
      }
    }
    // they fire: at the nearest ship within range
    const range = c.range * base, range2 = range * range;
    for (const e of this.list) {
      if (--e.wait > 0) continue;
      let best = null, bd = range2;
      for (const sh of ships) {
        const d = (sh.x - e.pos.x) ** 2 + (sh.y - e.pos.y) ** 2 + (sh.z - e.pos.z) ** 2;
        if (d < bd) { bd = d; best = sh; }
      }
      if (!best) { e.wait = 10; continue; }
      e.wait = c.cooldown[0] + Math.random() * c.cooldown[1];
      // aimed ahead of the ship: where it will be when the bolt gets there (if it flies on straight)
      const t = Math.sqrt(bd) / c.boltSpeed;
      const dir = new THREE.Vector3(best.x + best.dx * best.v * t - e.pos.x, best.y + best.dy * best.v * t - e.pos.y, best.z + best.dz * best.v * t - e.pos.z).normalize();
      this.bolts.push({ pos: e.pos.clone(), dir, life: c.boltLife });
    }
    // bolts fly; a ship within `hitRadius` is hit
    const hit2 = (c.hitRadius * Math.max(1, base / 24)) ** 2, dead = new Map();
    for (let b = this.bolts.length - 1; b >= 0; b--) {
      const bo = this.bolts[b];
      bo.pos.addScaledVector(bo.dir, c.boltSpeed);
      let gone = --bo.life <= 0;
      if (!gone) for (const sh of ships) {
        if ((sh.x - bo.pos.x) ** 2 + (sh.y - bo.pos.y) ** 2 + (sh.z - bo.pos.z) ** 2 > hit2) continue;
        const s = sh.p.swarm;
        s.damage[sh.i]++;
        this.hits++;
        debris?.emit(bo.pos, [1, 0.25, 0.15], 6);
        if (s.damage[sh.i] >= this.gun.hp) { if (!dead.has(sh.p)) dead.set(sh.p, new Set()); dead.get(sh.p).add(sh.i); }
        gone = true;
        break;
      }
      if (gone) this.bolts.splice(b, 1);
    }
    // our attack ships fire back
    const g = this.gun, gr2 = (g.range * base) ** 2;
    for (const sh of ships) {
      if (!sh.attack || !this.list.length) continue;
      const s = sh.p.swarm;
      if (s.gunWait[sh.i] > 0) { s.gunWait[sh.i]--; continue; }
      let best = null, bd = gr2;
      for (const e of this.list) {
        const d = (sh.x - e.pos.x) ** 2 + (sh.y - e.pos.y) ** 2 + (sh.z - e.pos.z) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) continue;
      s.gunWait[sh.i] = g.cooldown;
      best.hp -= g.damage;
      best.flash = 6;
      const col = new THREE.Color().fromArray(s.mesh.instanceColor.array, sh.i * 3);
      this.beams.push({ a: new THREE.Vector3(sh.x, sh.y, sh.z), b: best.pos.clone(), col, life: g.beamFrames, max: g.beamFrames });
    }
    // (ships shot down go only now: the indices above stay right until here)
    for (const [p, set] of dead) p.shipsDestroyed([...set]);
    for (let k = this.list.length - 1; k >= 0; k--) {
      const e = this.list[k];
      if (e.hp > 0) continue;
      debris?.emit(e.pos, [0.9, 0.2, 0.15], 30);
      debris?.emit(e.pos, [1, 0.8, 0.4], 12);
      this.list.splice(k, 1);
      this.killed++;
    }
    for (let k = this.beams.length - 1; k >= 0; k--) if (--this.beams[k].life <= 0) this.beams.splice(k, 1);
    this.draw();
  }

  draw() {
    const m = this.m, look = new THREE.Vector3();
    this.list.forEach((e, k) => {
      m.position.copy(e.pos);
      if (e.vel.lengthSq() > 1e-9) look.copy(e.pos).add(e.vel); else look.copy(e.pos).add(e.u);
      m.lookAt(look);
      m.updateMatrix();
      this.hull.setMatrixAt(k, m.matrix);
      this.cockpit.setMatrixAt(k, m.matrix);
      this.engine.setMatrixAt(k, m.matrix);
      const f = e.flash > 0 ? 3 : 1; // (hit: a white flash)
      this.hull.instanceColor.setXYZ(k, f, f, f);
    });
    for (const mesh of [this.hull, this.cockpit, this.engine]) { mesh.count = this.list.length; mesh.instanceMatrix.needsUpdate = true; }
    this.hull.instanceColor.needsUpdate = true;
    // bolts: a short red streak behind each; beams: a line fading out
    const put = (lines, items, seg) => {
      const P = lines.geometry.attributes.position, C = lines.geometry.attributes.color;
      const n = Math.min(items.length, P.count / 2);
      for (let k = 0; k < n; k++) seg(items[k], P.array, C.array, k * 6);
      lines.geometry.setDrawRange(0, n * 2);
      P.needsUpdate = C.needsUpdate = true;
    };
    const bc = this.boltColor, tail = this.cfg.boltLength;
    put(this.boltLines, this.bolts, (bo, P, C, o) => {
      P[o] = bo.pos.x; P[o + 1] = bo.pos.y; P[o + 2] = bo.pos.z;
      P[o + 3] = bo.pos.x - bo.dir.x * tail; P[o + 4] = bo.pos.y - bo.dir.y * tail; P[o + 5] = bo.pos.z - bo.dir.z * tail;
      C[o] = 1; C[o + 1] = 0.85; C[o + 2] = 0.7; C[o + 3] = bc.r; C[o + 4] = bc.g; C[o + 5] = bc.b;
    });
    put(this.beamLines, this.beams, (be, P, C, o) => {
      const k = be.life / be.max;
      P[o] = be.a.x; P[o + 1] = be.a.y; P[o + 2] = be.a.z; P[o + 3] = be.b.x; P[o + 4] = be.b.y; P[o + 5] = be.b.z;
      C[o] = be.col.r * k; C[o + 1] = be.col.g * k; C[o + 2] = be.col.b * k; C[o + 3] = k; C[o + 4] = k; C[o + 5] = k;
    });
  }
}
