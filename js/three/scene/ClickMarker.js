const THREE = window.THREE;

/**
 * Marker shown where the player clicked: a pulsing ring lying on the planet's surface
 * (or facing the camera when the click was beside the planet). Fades out after a while.
 */
export class ClickMarker {
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.age = Infinity;

    const material = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(cfg.radius * 0.72, cfg.radius, 48), material);
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(cfg.radius * 0.18, 24), material);
    this.group = new THREE.Group();
    this.group.add(this.ring, this.dot);
    this.group.visible = false;
    this.group.renderOrder = 2;
    scene.add(this.group);
    this.material = material;
  }

  /**
   * @param {{x,y,z}} point clicked point in the world
   * @param {boolean} onSurface true when the click hit the planet
   * @param {THREE.Camera} camera used to face the camera for clicks beside the planet
   */
  show(point, onSurface, camera) {
    const p = new THREE.Vector3(point.x, point.y, point.z);
    const normal = onSurface && p.lengthSq() > 0 ? p.clone().normalize() : camera.position.clone().sub(p).normalize();
    this.group.position.copy(p).addScaledVector(normal, this.cfg.lift);
    this.group.lookAt(this.group.position.clone().add(normal));
    this.group.visible = true;
    this.age = 0;
  }

  /** Call once per frame. */
  update() {
    if (!this.group.visible) return;
    const c = this.cfg;
    this.age++;
    if (this.age > c.lifeFrames) {
      this.group.visible = false;
      return;
    }
    const t = this.age / c.lifeFrames;
    const pulse = 1 + 0.18 * Math.sin(this.age * c.pulseSpeed);
    this.ring.scale.setScalar(pulse);
    // full opacity first, then a smooth fade over the last part of its life
    this.material.opacity = c.opacity * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
  }
}
