import { nebulaColor, starColor } from '../utils/space.js';

const THREE = window.THREE;

/** Sky: a sphere with nebulae (noise-generated texture) plus stars as points. */
export class Space3D {
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.seed = (Math.random() * 1e6) | 0;
    scene.add(this.createSky());
    for (const layer of cfg.stars.layers) scene.add(this.createStars(layer));
  }

  createSky() {
    const { width, height } = this.cfg.nebulaTexture;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(width, height);
    const [br, bg, bb] = this.cfg.backgroundRgb;
    const nebula = this.cfg.nebula;

    for (let j = 0; j < height; j++) {
      const theta = ((j + 0.5) / height) * Math.PI;
      const st = Math.sin(theta), ct = Math.cos(theta);
      for (let i = 0; i < width; i++) {
        const phi = ((i + 0.5) / width) * Math.PI * 2;
        // same layout as THREE.SphereGeometry UVs — no seam
        const x = -Math.cos(phi) * st, y = ct, z = Math.sin(phi) * st;
        const c = nebulaColor(x * 1.6, y * 1.6, z * 1.6, this.seed, nebula);
        const o = (j * width + i) * 4;
        img.data[o] = br + (c ? c[0] : 0);
        img.data[o + 1] = bg + (c ? c[1] : 0);
        img.data[o + 2] = bb + (c ? c[2] : 0);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(this.cfg.radius, 64, 32),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false }),
    );
    sky.renderOrder = -1;
    return sky;
  }

  createStars({ count, size, opacity }) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    const r = this.cfg.radius * 0.9;
    for (let k = 0; k < count; k++) {
      // uniformly on the sphere
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      v.set(q * Math.cos(a), u, q * Math.sin(a)).multiplyScalar(r);
      pos.set([v.x, v.y, v.z], k * 3);
      const [cr, cg, cb] = starColor();
      const b = 0.4 + Math.random() * 0.6;
      col.set([(cr / 255) * b, (cg / 255) * b, (cb / 255) * b], k * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity, depthWrite: false,
    }));
  }
}
