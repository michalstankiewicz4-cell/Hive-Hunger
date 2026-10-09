import { CONFIG } from '../config.js';
import { VoxelPlanet } from './VoxelPlanet.js';
import { Swarm3D } from './Swarm3D.js';
import { Debris3D } from './Debris3D.js';
import { Space3D } from './Space3D.js';
import { Leader } from '../core/Leader.js';

const THREE = window.THREE;

/**
 * Tryb 3D. Rój działa sam; kliknięcie / stuknięcie wskazuje mu cel.
 * Prawy przycisk / dwa palce = obrót kamery, kółko = przybliżenie.
 */
export class Game3D {
  constructor(container, hud) {
    this.cfg = CONFIG;
    this.hud = hud;
    this.level = 0;
    this.biteRadius = CONFIG.swarm.biteRadius; // siła: promień krateru (zmieniany suwakiem)
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

    // kamera na sferze wokół środka planety
    this.orbit = { theta: 0, phi: Math.PI / 2, distance: this.cfg.camera.distance };
    this.updateCamera();

    this.raycaster = new THREE.Raycaster();
    this.tmp = new THREE.Vector3();

    const start = this.pointFromScreen(new THREE.Vector2(0.55, 0.55));
    this.leader = new Leader(this.cfg.leader, start, ['x', 'y', 'z']);
    this.debris = new Debris3D(this.scene, this.cfg.debris);
    this.swarm = new Swarm3D(this.scene, this.cfg.swarm, new THREE.Vector3(start.x, start.y, start.z));
    this.spawnPlanet();

    // odsłonięte woksele przy celu roju — liczone dokładnie raz na klatkę
    this.candidates = [];
    const L = this.cfg.leader;
    this.world = {
      // cel roju zostaje, dopóki w okolicy są wolne (niczyje) woksele
      hasMatterNear: () => this.freeCandidates > 0,
      findMatter: (p) => this.planet.findMatter(p, L.searchSamples),
    };
    const feedCenter = new THREE.Vector3();
    this.swarmWorld = {
      feeding: false,
      // wolny (niezarezerwowany) woksel przy celu roju. Wspólny tylko wtedy, gdy na planecie
      // zostało mniej odsłoniętych wokseli niż osobników (więcej już nie ma).
      pickFood: () => {
        const list = this.candidates;
        const pl = this.planet;
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

  spawnPlanet() {
    this.level++;
    this.planet = new VoxelPlanet(this.scene, this.cfg.planet);
    this.swarm?.food.fill(-1); // rezerwacje dotyczyły starej planety
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
      // stuknięcie: lewy przycisk / jeden palec, bez obrotu i bez przeciągania
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

  /** Punkt w świecie pod ekranem: pierwszy pełny woksel, a obok planety — płaszczyzna przez jej środek. */
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

  /** Uderzenie osobnika wygryza mały krater wokół trafionego woksela. */
  biteCell(idx, ownFood) {
    const pl = this.planet;
    // jedzenie trwa: każda klatka na kąsku zabiera część wytrzymałości
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
      hint: 'klik: kieruj rój · prawy przycisk / dwa palce: obrót · kółko: zoom',
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // na wąskim (pionowym) ekranie trzymaj kąt widzenia w poziomie, żeby planeta się mieściła
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
