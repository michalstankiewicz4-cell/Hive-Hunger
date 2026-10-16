import { terrainColor, mix } from '../../utils/terrain.js';

const THREE = window.THREE;

/**
 * How the planet looks: materials, terrain and letter colours, the drawn cubes (exposed voxels as
 * instances) and how damage shows on them.
 * (Part of VoxelPlanet: these become its methods.)
 */
export const Look = {
  /** How much voxel normals tilt towards the sphere normal (spheres only; other shapes keep flat faces). */
  get shading() {
    return (this.shape === 'sphere' ? this.cfg.sphereShading : 0).toFixed(2);
  },

  createMaterial() {
    const material = new THREE.MeshLambertMaterial();
    // Voxel normal tilted towards the sphere normal — smooth day/night shading.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `vec3 sphereNormal = normalize((instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz + 1e-4);
         vec3 objectNormal = normalize(mix(vec3(normal), sphereNormal, ${this.shading}));`,
      );
    };
    return material;
  },

  /** Material of the extra surfaces: vertex colours, the same day/night shading as the cubes. */
  createSurfaceMaterial() {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `vec3 sphereNormal = normalize(position + 1e-4);
         vec3 objectNormal = normalize(mix(vec3(normal), sphereNormal, ${this.shading}));`,
      );
    };
    return material;
  },

  createMesh(capacity) {
    const old = this.mesh;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const idxOfSlot = new Int32Array(capacity);

    if (old) {
      mesh.visible = old.visible;
      mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, this.count * 16));
      mesh.instanceColor.array.set(old.instanceColor.array.subarray(0, this.count * 3));
      idxOfSlot.set(this.idxOfSlot.subarray(0, this.count));
      this.scene.remove(old);
    }
    mesh.count = this.count;
    this.mesh = mesh;
    this.idxOfSlot = idxOfSlot;
    this.capacity = capacity;
    this.scene.add(mesh);
  },

  colorOf(idx) {
    const p = this.gridCenter(idx, this._v);
    const d = p.length() || 1;
    let rgb;
    if (this.tags) {
      const c = this.tagColors[this.tags[idx]] || this.cfg.rock;
      return [c[0] / 255, c[1] / 255, c[2] / 255];
    }
    if (this.parts) {
      // the nearest object's own terrain: direction and depth from its centre
      const best = this.partAt(p.x, p.y, p.z);
      const lx = p.x - best.center[0], ly = p.y - best.center[1], lz = p.z - best.center[2];
      const ld = Math.hypot(lx, ly, lz) || 1;
      const deep = best.kind === 'cube' ? best.r - Math.max(Math.abs(lx), Math.abs(ly), Math.abs(lz)) : best.r - ld;
      rgb = deep < this.cfg.terrainDepth
        ? terrainColor(lx / ld, -ly / ld, lz / ld, this.seed + (best.kind === 'cube' ? 1 : 0), this.cfg.surface)
        : mix(this.cfg.rockCore, this.cfg.rock, Math.min(1, ld / best.r));
      return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
    }
    // depth under the surface: sphere — from the radius, cube — from the nearest face
    const depth = this.surfaceKind === 'cube'
      ? this.half - Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z))
      : this.R - d;
    if (depth < this.cfg.terrainDepth) {
      rgb = terrainColor(p.x / d, -p.y / d, p.z / d, this.seed, this.cfg.surface);
    } else {
      rgb = mix(this.cfg.rockCore, this.cfg.rock, Math.min(1, d / this.R));
    }
    return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
  },

  /** Several objects ('pair'): the one whose centre is nearest to a point. */
  partAt(x, y, z) {
    let best = this.parts[0], bestD = Infinity;
    for (const part of this.parts) {
      const dd = (x - part.center[0]) ** 2 + (y - part.center[1]) ** 2 + (z - part.center[2]) ** 2;
      if (dd < bestD) { bestD = dd; best = part; }
    }
    return best;
  },

  /** Colour of a voxel (0..1 RGB), cached — used by the extra surfaces. */
  voxelColor(idx) {
    const c = this.colors, o = this.colorOffset(idx);
    return [c[o] / 255, c[o + 1] / 255, c[o + 2] / 255];
  },

  /** Where voxel idx's colour (0…255 × 3) is in `colors`, worked out the first time it is needed. */
  colorOffset(idx) {
    const c = this.colors, o = idx * 3;
    if (!this.colored[idx]) {
      const [r, g, b] = this.colorOf(idx);
      c[o] = r * 255; c[o + 1] = g * 255; c[o + 2] = b * 255;
      this.colored[idx] = 1;
    }
    return o;
  },

  addInstance(idx) {
    if (this.count >= this.capacity) this.createMesh(Math.ceil(this.capacity * 1.6));
    const slot = this.count++;
    this.mesh.count = this.count;
    this._m.makeTranslation(...this.gridCenter(idx, this._v).toArray());
    this.mesh.setMatrixAt(slot, this._m);
    const [r, g, b] = this.colorOf(idx);
    this.mesh.setColorAt(slot, this._c.setRGB(r, g, b));
    this.slotOf[idx] = slot;
    this.idxOfSlot[slot] = idx;
    this.dirty = true;
  },

  removeInstance(idx) {
    const slot = this.slotOf[idx];
    if (slot < 0) return;
    const last = this.count - 1;
    if (slot !== last) {
      const m = this.mesh.instanceMatrix.array, c = this.mesh.instanceColor.array;
      m.copyWithin(slot * 16, last * 16, last * 16 + 16);
      c.copyWithin(slot * 3, last * 3, last * 3 + 3);
      const moved = this.idxOfSlot[last];
      this.idxOfSlot[slot] = moved;
      this.slotOf[moved] = slot;
    }
    this.slotOf[idx] = -1;
    this.count = last;
    this.mesh.count = last;
    this.dirty = true;
  },

  /**
   * Destruction animation: a damaged voxel shrinks, darkens and shakes as its strength runs
   * out (when it reaches 0 it is removed and breaks into debris).
   */
  showDamage(idx) {
    // the smooth surface shows damage too (the voxel sinks into it and darkens)
    if (this.surface) {
      const [i, j, k] = this.coords(idx);
      this.surface.touch(i, j, k);
    }
    const slot = this.slotOf[idx];
    // the cubes are hidden under the smooth surface: nothing to show on them
    if (slot < 0 || !this.mesh.visible) return;
    const f = Math.max(0, Math.min(1, this.hp[idx] / this.cfg.strength));
    const k = 0.45 + 0.55 * f, shake = (1 - f) * 0.08 * this.s;
    const c = this.gridCenter(idx, this._v);
    c.x += (Math.random() - 0.5) * shake; c.y += (Math.random() - 0.5) * shake; c.z += (Math.random() - 0.5) * shake;
    this._m.makeScale(k, k, k).setPosition(c);
    this.mesh.setMatrixAt(slot, this._m);
    const [r, g, b] = this.voxelColor(idx), dark = 0.35 + 0.65 * f;
    this.mesh.setColorAt(slot, this._c.setRGB(r * dark, g * dark, b * dark));
    this.dirty = true;
  },
};
