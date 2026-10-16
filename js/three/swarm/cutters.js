const THREE = window.THREE;

/**
 * Cutters' sheets: from the ship to the row it is cutting, a flat beam — a red ray along each edge and a
 * glowing haze drifting between them, like a flat laser shining through smoke — and a bright line where
 * it cuts. Drawn from cutList() (on a guest: what the host sent). Also takes away the meshes of the
 * boosters' fields and the sheets when the player leaves (disposeExtras).
 * (Part of Swarm3D: these become its methods.)
 */
const VERT = `
  attribute vec2 sheet;
  varying vec2 vS;
  void main() {
    vS = sheet;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// sheet.x: 0 … 1 across (the two edges), sheet.y: 0 at the ship … 1 at the cut
const FRAG = `
  uniform float time;
  uniform float opacity;
  uniform vec3 colSheet;
  uniform vec3 colEdge;
  varying vec2 vS;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float s = vS.x, a = vS.y;
    float edge = exp(-pow(s / 0.012, 2.0)) + exp(-pow((1.0 - s) / 0.012, 2.0));
    // the haze: soft streaks drifting from the ship to the cut
    float n = noise(vec2(s * 5.0, a * 9.0 - time * 2.2)) * noise(vec2(s * 13.0 + 7.0, a * 21.0 - time * 3.7));
    float haze = 0.18 + 0.75 * n;
    float fade = smoothstep(0.0, 0.12, a);
    vec3 col = colSheet * haze * 0.38 * fade + colEdge * edge * (0.75 + 0.25 * fade);
    gl_FragColor = vec4(col * opacity, 1.0);
  }
`;

export const CutterSheets = {
  /** A sheet (and the line where it cuts) for every cutter cutting now. */
  renderCutters() {
    const c = this.cfg.cutter;
    this.cutSheets ||= [];
    this.cutClock = (this.cutClock || 0) + (1 / 60) * c.hazeSpeed;
    const list = this.cutList();
    let m = 0;
    for (const [i, lx, ly, lz, rx, ry, rz] of list) {
      if (i >= this.count || this.hidden[i]) continue;
      let sh = this.cutSheets[m];
      if (!sh) sh = this.cutSheets[m] = this.makeSheet(c);
      const P = this.pos, i3 = i * 3;
      // the ship's end is narrow (apex), across the same way as the row
      let ax = rx - lx, ay = ry - ly, az = rz - lz;
      const al = Math.hypot(ax, ay, az) || 1;
      ax = (ax / al) * c.apex; ay = (ay / al) * c.apex; az = (az / al) * c.apex;
      const pos = sh.mesh.geometry.attributes.position.array;
      pos.set([P[i3] - ax, P[i3 + 1] - ay, P[i3 + 2] - az, P[i3] + ax, P[i3 + 1] + ay, P[i3 + 2] + az, lx, ly, lz, rx, ry, rz]);
      sh.mesh.geometry.attributes.position.needsUpdate = true;
      sh.mesh.geometry.computeBoundingSphere();
      sh.line.geometry.attributes.position.array.set([lx, ly, lz, rx, ry, rz]);
      sh.line.geometry.attributes.position.needsUpdate = true;
      sh.mesh.material.uniforms.time.value = this.cutClock;
      sh.mesh.visible = sh.line.visible = true;
      m++;
    }
    for (let k = m; k < this.cutSheets.length; k++) this.cutSheets[k].mesh.visible = this.cutSheets[k].line.visible = false;
    this.cutsShown = m; // (tests)
  },

  makeSheet(c) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('sheet', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
    g.setIndex([0, 1, 2, 1, 3, 2]);
    const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, opacity: { value: c.opacity }, colSheet: { value: new THREE.Color(c.sheetColor) }, colEdge: { value: new THREE.Color(c.edgeColor) } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    mesh.frustumCulled = false;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: c.edgeColor, transparent: true, blending: THREE.AdditiveBlending }));
    line.frustumCulled = false;
    this.scene.add(mesh, line);
    return { mesh, line };
  },

  /** The player left: its boosters' fields and cutters' sheets go too. */
  disposeExtras() {
    for (const sh of this.cutSheets || []) { this.scene.remove(sh.mesh, sh.line); sh.mesh.geometry.dispose(); sh.line.geometry.dispose(); }
    for (const f of this.fieldMeshes || []) this.scene.remove(f);
    this.cutSheets = [];
    this.fieldMeshes = [];
  },
};
