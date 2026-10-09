import { CONFIG } from '../config.js';
import { VoxelPlanet } from './VoxelPlanet.js';
import { Swarm3D, aroundPlanet } from './Swarm3D.js';
import { Debris3D } from './Debris3D.js';
import { Space3D } from './Space3D.js';
import { ClickMarker } from './ClickMarker.js';
import { SpawnBeacon } from './SpawnBeacon.js';
import { Leader } from '../core/Leader.js';

const THREE = window.THREE;

/**
 * The game. The swarm acts on its own; a click / tap gives it a target, a click on the
 * beacon calls it back home. Right button / two fingers = rotate the camera, wheel = zoom.
 *
 * Planet spin: the simulation stays in the planet's frame (voxels never move), and the
 * camera, sky, sun and beacon turn around it instead — on screen the planet rotates.
 */
export class Game3D {
  constructor(container, hud) {
    this.cfg = CONFIG;
    this.hud = hud;
    this.level = 0;
    this.biteRadius = CONFIG.swarm.biteRadius; // power: crater radius (changed by a slider)
    this.running = false;
    this.spin = 0;          // planet rotation angle (radians)
    this.homeMode = null;   // null | 'recall' (called back by the beacon) | 'return' (planet eaten)
    this.returnFrames = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.cfg.background);
    this.camera = new THREE.PerspectiveCamera(this.cfg.fov, 1, 0.1, 3000);

    const [lx, ly, lz] = this.cfg.planet.light;
    this.sun = new THREE.DirectionalLight(0xffffff, 0.95);
    this.sunBase = new THREE.Vector3(lx, ly, lz).multiplyScalar(100);
    this.sun.position.copy(this.sunBase);
    this.scene.add(this.sun, new THREE.AmbientLight(0xffffff, 0.14));

    this.space = new Space3D(this.scene, this.cfg.space);

    // camera on a sphere around the planet centre
    this.orbit = { theta: 0, phi: Math.PI / 2, distance: this.cfg.camera.distance };
    this.updateCamera();

    this.raycaster = new THREE.Raycaster();
    this.tmp = new THREE.Vector3();

    this.resize(); // camera aspect is needed to keep the spawn point on screen
    const start = this.spawnPoint();
    // the beacon lives in the space group: it stays put in space while the planet turns
    this.beacon = new SpawnBeacon(this.space.group, new THREE.Vector3(start.x, start.y, start.z), this.cfg.beacon);
    this.leader = new Leader(this.cfg.leader, start, ['x', 'y', 'z']);
    this.debris = new Debris3D(this.scene, this.cfg.debris);
    this.marker = new ClickMarker(this.scene, this.cfg.marker);
    this.swarm = new Swarm3D(this.scene, this.cfg.swarm, new THREE.Vector3(start.x, start.y, start.z));
    this.spawnPlanet();

    // exposed voxels near the swarm target — computed exactly once per frame
    this.candidates = [];
    const L = this.cfg.leader;
    this.world = {
      // the swarm target stays while there are free (unclaimed) voxels nearby
      hasMatterNear: () => this.freeCandidates > 0,
      findMatter: (p) => this.planet.findMatter(p, L.searchSamples),
    };
    const feedCenter = new THREE.Vector3();
    const nearestScratch = [];
    this.swarmWorld = {
      feeding: false,
      // a free (unclaimed) voxel near the swarm target. Shared only when the planet has
      // fewer exposed voxels left than there are units (there are no more).
      // test mechanic (checkbox): every unit goes to the nearest free voxel from its own position
      nearestMode: CONFIG.swarm.nearestMode,
      clickPoint: null,
      planetRadius: 0,
      holding: false, // called back home: nobody picks new bites
      pickFood: (p) => {
        const pl = this.planet;
        if (this.swarmWorld.nearestMode) {
          const idx = pl.nearestFree(p, pl.count < this.swarm.count, nearestScratch);
          pl.claim(idx);
          return idx;
        }
        const list = this.candidates;
        const n = list.length;
        if (n === 0) return -1;
        const start = (Math.random() * n) | 0;
        for (let k = 0; k < n; k++) {
          const idx = list[(start + k) % n];
          if (pl.claims[idx] === 0 && pl.hp[idx] > 0) {
            pl.claim(idx);
            this.freeCandidates--;
            return idx;
          }
        }
        if (pl.count >= this.swarm.count) return -1;
        const idx = list[start];
        pl.claim(idx);
        return idx;
      },
      release: (idx) => this.planet.release(idx),
      claim: (idx) => this.planet.claim(idx),
      canBite: (idx, ownFood) => !this.planet.claimedByOther(idx, ownFood),
      cellCenter: (idx) => this.planet.cellCenter(idx, feedCenter),
      cellAt: (p) => this.planet.cellAt(p),
      isSolidCell: (idx) => idx >= 0 && this.planet.hp[idx] > 0,
      bite: (idx, ownFood) => this.biteCell(idx, ownFood),
    };

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Spawn point at a distance from the planet's surface of about the planet's size
   * (spawnGap × radius). The direction is chosen so the swarm is on screen, on the left
   * (away from the panel): as far to the side as the screen allows, more in front of the
   * planet on narrow screens.
   */
  spawnPoint() {
    const r = this.cfg.planet.radius * (1 + this.cfg.swarm.spawnGap);
    const toCam = this.camera.position.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.camera.quaternion);
    const side = left.multiplyScalar(1).add(up.multiplyScalar(0.3)).normalize();
    const p = new THREE.Vector3();
    for (let deg = 85; deg >= 5; deg -= 5) {
      const a = (deg * Math.PI) / 180;
      p.copy(toCam).multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).multiplyScalar(r);
      const ndc = p.clone().project(this.camera);
      if (Math.abs(ndc.x) < 0.8 && Math.abs(ndc.y) < 0.7 && ndc.z < 1) break;
    }
    return { x: p.x, y: p.y, z: p.z };
  }

  /** While travelling to a click, the swarm target flies around the planet, not through it. */
  keepLeaderOverSurface() {
    const L = this.leader;
    if (!L.commanded || !this.planet.alive) return;
    const a = this.cfg.swarm.avoid;
    const way = aroundPlanet(L.pos.x, L.pos.y, L.pos.z, L.goal.x, L.goal.y, L.goal.z, this.planet.R, a);
    const r = Math.hypot(L.pos.x, L.pos.y, L.pos.z) || 1;
    if (way || (L.distanceTo(L.goal) > a.minDistance && r < this.planet.R + a.altitude)) {
      const k = (this.planet.R + a.altitude) / r;
      if (k > 1) { L.pos.x *= k; L.pos.y *= k; L.pos.z *= k; }
    }
    // steer the target's velocity towards the waypoint, so it arcs over the surface
    if (way) {
      const dx = way[0] - L.pos.x, dy = way[1] - L.pos.y, dz = way[2] - L.pos.z;
      const d = Math.hypot(dx, dy, dz) || 1, v = this.cfg.leader.maxSpeed;
      L.vel.x = (dx / d) * v; L.vel.y = (dy / d) * v; L.vel.z = (dz / d) * v;
    }
  }

  /**
   * A click / tap: the swarm target heads for the point and every unit drops its current
   * bite, so the whole swarm goes there. In nearest-block mode each unit's next bite is
   * the nearest free voxel to the clicked point.
   */
  command(point) {
    this.homeMode = null;
    this.leader.command(point);
    this.swarmWorld.clickPoint = point;
    this.dropAllBites(1);
  }

  /** Current world position of the spawn beacon. */
  spawnWorld() {
    const p = this.beacon.worldPosition(new THREE.Vector3());
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Every unit drops its bite (releasing the claim) and stops eating. */
  dropAllBites(redirect) {
    const s = this.swarm;
    for (let i = 0; i < s.count; i++) {
      if (s.food[i] >= 0) this.planet.release(s.food[i]);
      s.food[i] = -1;
      s.landed[i] = 0;
      s.redirect[i] = redirect;
    }
  }

  /** The beacon was clicked: the swarm stops eating and flies home, and waits there for a new click. */
  recall() {
    this.homeMode = 'recall';
    this.swarmWorld.clickPoint = null;
    this.dropAllBites(0);
  }

  /** Switches the nearest-block test mechanic; units drop their current bites and pick again by the new rule. */
  setNearestMode(on) {
    this.swarmWorld.nearestMode = on;
    const s = this.swarm;
    for (let i = 0; i < s.count; i++) {
      if (s.food[i] >= 0) this.planet.release(s.food[i]);
      s.food[i] = -1;
      s.landed[i] = 0;
      s.redirect[i] = 0;
    }
  }

  spawnPlanet() {
    this.level++;
    this.planet = new VoxelPlanet(this.scene, this.cfg.planet);
    this.swarm?.food.fill(-1); // claims belonged to the old planet
    this.swarm?.landed.fill(0);
  }

  bindInput() {
    const c = this.cfg.camera;
    const pointers = new Map();
    let rotating = false;
    let rotated = false;
    let last = null;
    let tap = null;

    const center = () => {
      let x = 0, y = 0;
      for (const p of pointers.values()) { x += p.x; y += p.y; }
      return { x: x / pointers.size, y: y / pointers.size };
    };

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      rotating = e.button === 2 || pointers.size >= 2;
      if (pointers.size === 1) {
        rotated = false;
        tap = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      }
      last = center();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!rotating) return;
      const now = center();
      this.orbit.theta -= (now.x - last.x) * c.rotateSpeed;
      this.orbit.phi = Math.min(Math.PI - 0.05, Math.max(0.05, this.orbit.phi - (now.y - last.y) * c.rotateSpeed));
      last = now;
      rotated = true;
      this.updateCamera();
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      // a tap: left button / one finger, with no rotation and no drag
      if (e.type === 'pointerup' && tap && !rotated && pointers.size === 0 &&
          Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= 8) {
        const ndc = this.toNdc(e);
        this.raycaster.setFromCamera(ndc, this.camera);
        if (this.beacon.hitBy(this.raycaster.ray)) {
          if (this.homeMode !== 'return') this.recall();
        } else if (this.homeMode !== 'return' && this.planet.alive) {
          const point = this.pointFromScreen(ndc);
          this.command(point);
          this.marker.show(point, this.lastPickHit, this.camera);
        }
      }
      if (pointers.size === 0) { rotating = false; tap = null; } else last = center();
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(Math.sign(e.deltaY) * c.zoomSpeed);
      this.orbit.distance = Math.min(c.maxDistance, Math.max(c.minDistance, this.orbit.distance * f));
      this.updateCamera();
    }, { passive: false });
  }

  toNdc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  updateCamera() {
    const { theta, phi, distance } = this.orbit;
    this.camera.position.setFromSphericalCoords(distance, phi, theta + this.spin);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  /** World point under the screen point: the first solid voxel, or beside the planet — the plane through its centre. */
  pointFromScreen(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const hit = this.planet && this.planet.raycastSolid(ray, this.tmp);
    this.lastPickHit = Boolean(hit);
    if (!hit) {
      const t = -ray.origin.dot(ray.direction);
      this.tmp.copy(ray.direction).multiplyScalar(t).add(ray.origin);
    }
    return { x: this.tmp.x, y: this.tmp.y, z: this.tmp.z };
  }

  /** A feeding unit eats a small crater around the voxel it sits on. */
  biteCell(idx, ownFood) {
    const pl = this.planet;
    // eating takes time: every frame on a bite removes part of its strength
    const damage = this.cfg.planet.strength / this.cfg.swarm.eatFrames;
    pl.biteSphere(idx, this.biteRadius, damage, (n) => {
      this.debris.emit(pl.cellCenter(n, this.tmp), pl.colorOf(n), this.cfg.debris.perCell);
    }, ownFood);
  }

  /** Turns the camera, sky, sun and beacon around the planet — on screen the planet spins. */
  updateSpin() {
    this.spin += this.cfg.planet.spinSpeed;
    this.space.group.rotation.y = this.spin;
    this.sun.position.copy(this.sunBase).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.spin);
    this.updateCamera();
  }

  update() {
    this.updateSpin();
    const pl0 = this.planet;
    pl0.exposedNear(this.leader.pos, this.cfg.leader.feedSenseRadius, this.candidates);
    this.freeCandidates = 0;
    for (const idx of this.candidates) if (pl0.claims[idx] === 0) this.freeCandidates++;
    if (this.homeMode) {
      // heading home: the swarm target keeps following the beacon (it moves as space turns)
      const L0 = this.leader;
      L0.goal = this.spawnWorld();
      L0.commanded = true;
      L0.dwell = 0;
    }
    this.leader.update(this.world);
    this.keepLeaderOverSurface();
    // while the swarm target is travelling to a clicked point, units follow it instead of eating
    const L = this.leader;
    const travelling = L.commanded && L.distanceTo(L.goal) > this.cfg.leader.arriveRadius;
    this.swarmWorld.planetRadius = this.planet.alive ? this.planet.R : 0;
    this.swarmWorld.holding = Boolean(this.homeMode);
    this.swarmWorld.feeding = this.candidates.length > 0 && !travelling && !this.homeMode;
    this.swarm.update(this.leader.pos, this.swarmWorld);

    const pl = this.planet;
    // the planet counts as eaten only when its last voxel is gone; then the swarm flies home
    if (pl.alive && pl.left <= 0) {
      pl.shatter((idx, color) => this.debris.emit(pl.cellCenter(idx, this.tmp), color, this.cfg.debris.perCellOnFinish));
      this.homeMode = 'return';
      this.returnFrames = 0;
      this.dropAllBites(0);
    }
    // back home: the next planet appears once the swarm has gathered at the beacon
    if (this.homeMode === 'return') {
      this.returnFrames++;
      const home = this.spawnWorld();
      const c = this.swarm.center();
      const gathered = Math.hypot(c.x - home.x, c.y - home.y, c.z - home.z) < this.cfg.beacon.gatherRadius;
      if ((this.leader.distanceTo(home) < this.cfg.beacon.arriveRadius && gathered) || this.returnFrames > this.cfg.beacon.returnTimeoutFrames) {
        pl.dispose();
        this.spawnPlanet();
        this.homeMode = null;
        this.leader.commanded = false;
        this.leader.goal = null;
      }
    }

    pl.sync();
    this.debris.update();
    this.marker.update();
    this.beacon.active = Boolean(this.homeMode);
    this.beacon.update(this.camera);
    const hint = this.homeMode === 'return'
      ? 'planet eaten — returning to the beacon'
      : this.homeMode === 'recall'
        ? 'called back · click the planet to send the swarm out again'
        : 'click: steer the swarm · click the beacon: call it back · right button / two fingers: rotate · wheel: zoom';
    this.hud.update({ level: this.level, eaten: this.planet.eatenFraction, hint });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // on a narrow (portrait) screen keep the horizontal field of view so the planet fits
    const half = (this.cfg.fov / 2) * (Math.PI / 180);
    this.camera.fov = aspect < 1 ? (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI : this.cfg.fov;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    const loop = () => {
      if (!this.running) return;
      this.update();
      this.swarm.render();
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }
}
