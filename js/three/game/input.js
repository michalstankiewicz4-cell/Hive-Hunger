import { settings } from '../../settings.js';

const THREE = window.THREE;
const WORLD_Y = new THREE.Vector3(0, 1, 0);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
const ORBIT_STEP = new THREE.Quaternion();

/**
 * Mouse and touch: a tap steers the swarm (or, on its tunnel, calls it back), the right button or
 * two fingers turn the camera, the wheel zooms; the camera on its sphere around the planet.
 * (Part of Game3D: these become its methods.)
 */
export const Input = {
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
      // turn around the camera's own axes: sideways around its up, up/down around its right —
      // no limit either way, it can go right over the poles
      const k = c.rotateSpeed * settings.get('rotateSpeed');
      this.orbit.q.multiply(ORBIT_STEP.setFromAxisAngle(LOCAL_UP, -(now.x - last.x) * k));
      this.orbit.q.multiply(ORBIT_STEP.setFromAxisAngle(LOCAL_RIGHT, -(now.y - last.y) * k));
      this.orbit.q.normalize();
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
        this.onTap(this.toNdc(e));
      }
      if (pointers.size === 0) { rotating = false; tap = null; } else last = center();
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(Math.sign(e.deltaY) * c.zoomSpeed * settings.get('zoomSpeed'));
      this.orbit.distance = Math.min(c.maxDistance, Math.max(c.minDistance, this.orbit.distance * f));
      this.updateCamera();
    }, { passive: false });
  },

  /**
   * A tap on the screen, for the group chosen in the ship bar (`this.group`): own tunnel → call
   * that group back, a voxel (the planet or a drifting piece) → send it there. Anywhere else: nothing.
   */
  onTap(ndc) {
    const me = this.localPlayer;
    if (!me || !this.planet || !this.started) return;
    const group = this.group;
    this.raycaster.setFromCamera(ndc, this.camera);
    if (me.beacon.hitBy(this.raycaster.ray)) {
      if (this.role === 'guest') this.net.sendCommand({ kind: 'recall', group });
      else me.recall(group);
      return;
    }
    if (!this.planet.alive || me.homeMode === 'jump') return;
    const point = this.pointFromScreen(ndc);
    if (!this.lastPickHit) return; // empty space: ships can only be sent to voxels
    this.marker.show(point, true, this.camera);
    if (this.role === 'guest') this.net.sendCommand({ kind: 'click', p: point, group });
    else me.command(point, group);
  },

  /** The ship bar's + : buy `n` ships of type `kind` (a guest asks the host). */
  buyShips(kind, n) {
    if (!this.localPlayer) return;
    if (this.role === 'guest') this.net.sendCommand({ kind: 'buy', group: kind, n });
    else this.localPlayer.buyShips(kind, n);
  },

  /** A setting changed on the local panel. */
  setLocalSetting(key, value) {
    if (this.role === 'guest') {
      this.net.sendSetting(key, value);
      // a guest draws its own ships turning at its own pace too (the host decides when they eat)
      if (key === 'turn' && this.localPlayer) this.localPlayer.swarm.turnSmoothing = value;
    }
    else this.localPlayer.setSetting(key, value);
  },

  toNdc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  },

  /**
   * The camera on its sphere around the planet: `orbit.q` is its orientation (turned by dragging,
   * any way round), the planet's spin turns it about the world's Y axis on top of that; it looks at
   * the centre from `orbit.distance`.
   */
  updateCamera() {
    const cam = this.camera;
    cam.quaternion.setFromAxisAngle(WORLD_Y, this.spin).multiply(this.orbit.q);
    cam.position.set(0, 0, this.orbit.distance).applyQuaternion(cam.quaternion);
    cam.updateMatrixWorld();
  },

  /** Turns the camera to look at the planet from `angle` around the Y axis (level with the equator). */
  faceAngle(angle) {
    this.orbit.q.setFromAxisAngle(WORLD_Y, angle);
    this.updateCamera();
  },

  /** World point under the screen point: the first solid voxel (also of a drifting piece), or beside the planet — the plane through its centre. */
  pointFromScreen(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const hit = this.planet && this.planet.raycastSolid(ray, this.tmp, true);
    this.lastPickHit = Boolean(hit);
    if (!hit) {
      const t = -ray.origin.dot(ray.direction);
      this.tmp.copy(ray.direction).multiplyScalar(t).add(ray.origin);
    }
    return { x: this.tmp.x, y: this.tmp.y, z: this.tmp.z };
  },
};
