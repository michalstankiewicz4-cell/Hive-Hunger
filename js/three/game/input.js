const THREE = window.THREE;

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
        this.onTap(this.toNdc(e));
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
  },

  /** A tap on the screen: own tunnel → call the swarm back, planet → send the swarm there. */
  onTap(ndc) {
    const me = this.localPlayer;
    if (!me || !this.planet || !this.started) return;
    this.raycaster.setFromCamera(ndc, this.camera);
    if (me.beacon.hitBy(this.raycaster.ray)) {
      if (this.role === 'guest') this.net.sendCommand({ kind: 'recall' });
      else me.recall();
      return;
    }
    if (!this.planet.alive || me.homeMode === 'jump') return;
    const point = this.pointFromScreen(ndc);
    this.marker.show(point, this.lastPickHit, this.camera);
    if (this.role === 'guest') this.net.sendCommand({ kind: 'click', p: point });
    else me.command(point);
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

  updateCamera() {
    const { theta, phi, distance } = this.orbit;
    this.camera.position.setFromSphericalCoords(distance, phi, theta + this.spin);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  },

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
  },
};
