const THREE = window.THREE;

/**
 * Boosters' force fields: a gentle ball of octagonal cells in pinks round every booster (drawn on the
 * host and the guests alike), and — host — which ships of this swarm are inside one (`boosted`: they
 * have `booster.boost` × the player's Power; several fields don't add up).
 * (Part of Swarm3D: these become its methods.)
 */

// the six sides of a cube blown up to a ball (equal angles), each side `cells` × `cells` octagons with
// small squares between them; lines in light pink, the cells a faint deep pink each with its own shimmer,
// a glowing rim where the ball turns away
const VERT = `
  varying vec3 vObj;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vObj = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = `
  uniform float time;
  uniform float seed;
  uniform float cells;
  uniform float line;
  uniform float opacity;
  uniform float fill;
  uniform float rim;
  uniform vec3 colA;
  uniform vec3 colB;
  varying vec3 vObj;
  varying vec3 vN;
  varying vec3 vV;
  float oct(vec2 q) { q = abs(q); return max(max(q.x, q.y), (q.x + q.y) * 0.70710678); }
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 n = normalize(vObj), a = abs(n);
    vec2 uv; float face;
    if (a.x >= a.y && a.x >= a.z) { uv = n.yz / a.x; face = n.x > 0.0 ? 0.0 : 1.0; }
    else if (a.y >= a.z) { uv = n.xz / a.y; face = n.y > 0.0 ? 2.0 : 3.0; }
    else { uv = n.xy / a.z; face = n.z > 0.0 ? 4.0 : 5.0; }
    uv = atan(uv) * 1.2732395; // equal angles: -1 … 1
    vec2 g = (uv * 0.5 + 0.5) * cells;
    vec2 cid = floor(g);
    float d = oct(fract(g) - 0.5);
    float edge = 1.0 - smoothstep(0.0, line, abs(0.5 - d));
    float h = hash(vec3(cid, face + seed));
    float shimmer = 0.55 + 0.45 * sin(time * 1.7 + h * 6.2832);
    float inSquare = step(0.5, d); // the small squares between the octagons
    vec3 cell = mix(colA, colB, h * 0.6 + inSquare * 0.4);
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    vec3 col = cell * fill * shimmer + colB * edge * (0.45 + 0.25 * shimmer) + mix(colA, colB, 0.5) * f * rim;
    gl_FragColor = vec4(col * opacity, 1.0);
  }
`;

export const ForceFields = {
  /**
   * Host: `boosted[i]` = 1 for every ship of this swarm within `booster.radius` of one of its boosters
   * (the boosters themselves too — they don't eat). Ships not out of the tunnel / jumping away are left out.
   */
  updateBoost() {
    const b = this.boosters, boosted = this.boosted;
    boosted.fill(0, 0, this.count);
    if (!b) return;
    const r = this.cfg.booster.radius, r2 = r * r, P = this.pos;
    const start = this.kindStart('boosters'), end = Math.min(start + b, this.count);
    const away = (k) => this.hidden[k] || this.warpT[k] > 0;
    for (let f = start; f < end; f++) {
      if (away(f)) continue;
      const fx = P[f * 3], fy = P[f * 3 + 1], fz = P[f * 3 + 2];
      for (let k = 0; k < this.count; k++) {
        if (boosted[k] || away(k)) continue;
        const dx = P[k * 3] - fx, dy = P[k * 3 + 1] - fy, dz = P[k * 3 + 2] - fz;
        if (dx * dx + dy * dy + dz * dz <= r2) boosted[k] = 1;
      }
    }
  },

  /** How many of this swarm's ships are in a field now (tests). */
  boostedCount() {
    let n = 0;
    for (let i = 0; i < this.count; i++) n += this.boosted[i];
    return n;
  },

  /** A field round every booster that is out (made as needed, one mesh each, sharing the geometry). */
  renderFields() {
    const c = this.cfg.booster;
    this.fieldMeshes ||= [];
    if (!this.fieldGeo) {
      this.fieldGeo = new THREE.SphereGeometry(c.radius, c.segments, Math.round(c.segments * 0.75));
      this.fieldClock = 0;
    }
    this.fieldClock += 1 / 60;
    const start = this.kindStart('boosters'), end = Math.min(start + this.boosters, this.count);
    let m = 0;
    for (let i = start; i < end; i++) {
      if (this.hidden[i]) continue;
      let mesh = this.fieldMeshes[m];
      if (!mesh) {
        const [a, b] = c.fieldColors;
        mesh = new THREE.Mesh(this.fieldGeo, new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 }, seed: { value: m * 7.31 }, cells: { value: c.cells }, line: { value: c.line },
            opacity: { value: c.opacity }, fill: { value: c.fill }, rim: { value: c.rim },
            colA: { value: new THREE.Color(a) }, colB: { value: new THREE.Color(b) },
          },
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }));
        mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, 0);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.fieldMeshes[m] = mesh;
      }
      mesh.visible = true;
      mesh.position.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      mesh.rotation.y += c.spin;
      mesh.rotation.x += c.spin * 0.6;
      mesh.material.uniforms.time.value = this.fieldClock;
      m++;
    }
    for (let k = m; k < this.fieldMeshes.length; k++) this.fieldMeshes[k].visible = false;
    this.fieldsShown = m; // (tests)
  },
};
