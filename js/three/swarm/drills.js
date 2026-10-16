import { canvasTexture } from '../textures.js';

const THREE = window.THREE;

/**
 * Drills' bits (Swarm3D): while a drill is drilling, an orange spiral cone turns at its nose —
 * orange and dark grooves winding round it, lit by the sun, with a faint glow. One mesh per drilling
 * ship, reused.
 * (Part of Swarm3D: these become its methods.)
 */
export const DrillBits = {
  /** Units drilling now: [unit, …] (on a guest: from the host). */
  drillList() {
    if (this.remote) return this.remoteDrilling || [];
    const out = [];
    for (let i = 0; i < this.count; i++) if (this.drillLeft[i] > 0 && !this.hidden[i]) out.push(i);
    return out;
  },

  renderDrills() {
    const c = this.cfg.drill, list = this.drillList();
    this.drillBits ||= [];
    this.drillSpin = (this.drillSpin || 0) + c.bitSpin;
    let n = 0;
    for (const i of list) {
      if (i >= this.count) continue;
      const bit = this.drillBits[n] || (this.drillBits[n] = makeBit(c, this.cfg.size[2], this.scene));
      n++;
      const i3 = i * 3;
      bit.position.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]);
      BIT_D.set(this.look[i3], this.look[i3 + 1], this.look[i3 + 2]);
      bit.quaternion.setFromUnitVectors(FORWARD, BIT_D);
      bit.children[0].rotation.z = this.drillSpin + i; // the spiral turning
      bit.visible = true;
    }
    for (let k = n; k < this.drillBits.length; k++) this.drillBits[k].visible = false;
  },

  disposeDrills() {
    for (const b of this.drillBits || []) this.scene.remove(b);
    this.drillBits = [];
  },
};

const FORWARD = new THREE.Vector3(0, 0, 1);
const BIT_D = new THREE.Vector3();

let spiral = null;
/** Orange with dark grooves running diagonally: wrapped round a cone, they wind up it as a spiral. */
function spiralTexture(c) {
  if (spiral) return spiral;
  const light = '#' + new THREE.Color(c.bitColor).getHexString(), dark = '#' + new THREE.Color(c.bitDark).getHexString();
  spiral = canvasTexture(64, 64, (g) => {
    g.fillStyle = light;
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = dark;
    g.lineWidth = 9;
    for (let k = -64; k < 128; k += 21) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
    g.strokeStyle = 'rgba(255,240,200,0.55)'; // a bright edge on every turn
    g.lineWidth = 2;
    for (let k = -64; k < 128; k += 21) { g.beginPath(); g.moveTo(k + 6, 64); g.lineTo(k + 70, 0); g.stroke(); }
  });
  spiral.wrapS = spiral.wrapT = THREE.RepeatWrapping;
  spiral.repeat.set(2, 1);
  return spiral;
}

/** A bit: a cone along +z from the ship's nose (`shipLength` long ship), its point forward. */
function makeBit(c, shipLength, scene) {
  const geo = new THREE.ConeGeometry(c.bitRadius, c.bitLength, 20, 1);
  geo.rotateX(Math.PI / 2); // the point to +z
  const cone = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    map: spiralTexture(c), color: 0xffffff, emissive: c.bitColor, emissiveIntensity: 0.25, shininess: 60, specular: 0x664422,
  }));
  const group = new THREE.Group();
  cone.position.z = shipLength / 2 + c.bitLength / 2 - 0.02;
  group.add(cone);
  scene.add(group);
  return group;
}
