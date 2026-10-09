const THREE = window.THREE;

/**
 * Beacon at the swarm's spawn point. Clicking it calls the swarm back home; it glows
 * brighter while the swarm is called back or returning.
 */
export class SpawnBeacon {
  constructor(parent, position, cfg) {
    this.cfg = cfg;
    this.t = 0;
    this.active = false;

    this.material = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.9 });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(cfg.size, 0), this.material);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: cfg.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(cfg.size * 1.6, cfg.size * 1.9, 48), this.ringMaterial);

    this.group = new THREE.Group();
    this.group.add(this.core, this.ring);
    this.group.position.copy(position);
    parent.add(this.group);
  }

  /** World position of the beacon (it moves with the space group). */
  worldPosition(out) {
    return this.group.getWorldPosition(out);
  }

  /** Distance from a ray to the beacon — used to detect clicks on it. */
  hitBy(ray) {
    const p = this.worldPosition(new THREE.Vector3());
    return ray.distanceToPoint(p) < this.cfg.hitRadius;
  }

  update(camera) {
    this.t++;
    const c = this.cfg;
    this.core.rotation.y += 0.02;
    this.core.rotation.x += 0.013;
    this.ring.lookAt(camera.position);
    const pulse = 1 + (this.active ? 0.35 : 0.12) * Math.sin(this.t * (this.active ? 0.2 : 0.06));
    this.ring.scale.setScalar(pulse);
    this.ringMaterial.opacity = this.active ? 0.85 : 0.45;
  }
}
