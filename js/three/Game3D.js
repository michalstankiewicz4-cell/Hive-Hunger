import { CONFIG } from '../config.js';
import { VoxelPlanet } from './VoxelPlanet.js';
import { Swarm3D } from './Swarm3D.js';
import { Debris3D } from './Debris3D.js';
import { Space3D } from './Space3D.js';
import { Leader } from '../core/Leader.js';

const THREE = window.THREE;

/**
 * The game. The swarm acts on its own; a click / tap gives it a target.
 * Right button / two fingers = rotate the camera, wheel = zoom.
 */
export class Game3D {
  constructor(container, hud) {
    this.cfg = CONFIG;
    this.hud = hud;
    this.level = 0;
    this.biteRadius = CONFIG.swarm.biteRadius; // power: crater radius (changed by a slider)
    this.running = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.cfg.background);
    this.camera = new THREE.PerspectiveCamera(this.cfg.fov, 1, 0.1, 3000);

    const [lx, ly, lz] = this.cfg.planet.light;
    const sun = new THREE.DirectionalLight(0xffffff, 0.95);
    sun.position.set(lx, ly, lz).multiplyScalar(100);
    this.scene.add(sun, new THREE.AmbientLight(0xffffff, 0.14));

    this.space = new Space3D(this.scene, this.cfg.space);

    // camera on a sphere around the planet centre
    this.orbit = { theta: 0, phi: Math.PI / 2, distance: this.cfg.camera.distance };
    this.updateCamera();

    this.raycaster = new THREE.Raycaster();
    this.tmp = new THREE.Vector3();

    const start = this.pointFromScreen(new THREE.Vector2(0.55, 0.55));
    this.leader = new Leader(this.cfg.leader, start, ['x', 'y', 'z']);
    this.debris = new Debris3D(this.scene, this.cfg.debris);
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

  /** Switches the nearest-block test mechanic; units drop their current bites and pick again by the new rule. */
  setNearestMode(on) {
    this.swarmWorld.nearestMode = on;
    const s = this.swarm;
    for (let i = 0; i < s.count; i++) {
      if (s.food[i] >= 0) this.planet.release(s.food[i]);
      s.food[i] = -1;
      s.landed[i] = 0;
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
        this.leader.command(this.pointFromScreen(this.toNdc(e)));
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
    this.camera.position.setFromSphericalCoords(distance, phi, theta);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  /** World point under the screen point: the first solid voxel, or beside the planet — the plane through its centre. */
  pointFromScreen(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const hit = this.planet && this.planet.raycastSolid(ray, this.tmp);
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

  update() {
    const pl0 = this.planet;
    pl0.exposedNear(this.leader.pos, this.cfg.leader.feedSenseRadius, this.candidates);
    this.freeCandidates = 0;
    for (const idx of this.candidates) if (pl0.claims[idx] === 0) this.freeCandidates++;
    this.leader.update(this.world);
    this.swarmWorld.feeding = this.candidates.length > 0;
    this.swarm.update(this.leader.pos, this.swarmWorld);

    const pl = this.planet;
    if (pl.alive && pl.left < pl.total * this.cfg.planet.finishThreshold) {
      pl.shatter((idx, color) => this.debris.emit(pl.cellCenter(idx, this.tmp), color, this.cfg.debris.perCellOnFinish));
      setTimeout(() => {
        pl.dispose();
        this.spawnPlanet();
      }, this.cfg.planet.nextPlanetDelay);
    }

    pl.sync();
    this.debris.update();
    this.hud.update({
      level: this.level,
      eaten: pl.eatenFraction,
      hint: 'click: steer the swarm · right button / two fingers: rotate · wheel: zoom',
    });
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
