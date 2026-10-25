import { SOLAR, bodyById, taskOf } from '../solar.js';
import { el, button } from './dom.js';
import { CarrierModel, paintCarrier } from '../three/carrier/CarrierModel.js';
import { MODULES } from '../three/carrier/carrierVoxels.js';

const THREE = window.THREE;

/**
 * The solar system map the game starts from (single player and multiplayer): the Sun in the middle,
 * the orbits, the planets with their moons and the two belts, seen from above at an angle — in 3D,
 * on its own canvas over the game. Drag to turn it, the wheel (or two fingers) to zoom; a click on a
 * body opens its card: a small picture, what it is, the task and Start (or "Coming soon" for the
 * bodies that can't be played yet). The next mission is marked; finished ones get a tick.
 *
 * Single player: Start on a card begins that mission. Multiplayer: the missions go in order — the map
 * shows where the room is going, without Start.
 *
 * Beyond the Kuiper Belt waits the Hive Carrier, the player's mothership (CarrierModel): its card's
 * Go aboard shows it full size on its own (drag, zoom; Back or Esc to the map) with its modules.
 */

/** The carrier on the map: beyond the Kuiper Belt, standing still on its own orbit. */
export const CARRIER = Object.freeze({
  id: 'carrier', name: 'Hive Carrier', kind: 'Your mothership', type: 'carrier', orbit: 94, angle: -2.55, size: 2.6, length: 6.5,
  color: [143, 208, 255],
  text: 'The swarm’s home: a carrier five times as long as Earth is wide, waiting beyond the Kuiper Belt. Its ships take off from the honeycomb of launch cells in its deck.',
});

const PITCH = [0.18, 1.45];   // how far it may tilt (radians from the orbit plane)
const DIST = [18, 230];       // zoom (the whole system)
const NEAR = [3, 60];         // zoom on a planet and its moons
const CLICK_MOVE = 6;         // px: more than this between press and release is a drag, not a click

export class SolarMap {
  /**
   * @param {HTMLElement} root the full-screen #map element
   * @param {{playable:(id:string)=>boolean, onStart:(id:string)=>void, onBack:()=>void}} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.state = { mode: 'solo', next: null, current: null, done: new Set() };
    this.selected = null;
    this.visible = false;
    this.time = 0;

    this.canvas = el('canvas', 'map-canvas');
    this.labels = el('div', 'map-labels');
    const head = el('div', 'map-head');
    this.title = el('h2', 'map-title', 'Solar system');
    this.hint = el('p', 'map-hint', 'Drag to turn · wheel to zoom · click a body');
    this.back = button('Back', () => (this.aboard ? this.leaveCarrier() : this.focus ? this.zoomOut() : opts.onBack()), 'map-back');
    head.append(this.title, this.hint, this.back);
    this.card = el('div', 'map-card');
    this.card.hidden = true;
    this.noteEl = el('div', 'map-note');
    this.noteEl.setAttribute('role', 'status');
    this.noteEl.hidden = true;
    this.root.append(this.canvas, this.labels, head, this.card, this.noteEl);

    this.renderer = null; // made when first shown (a second WebGL context only while the map is used)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.view = { yaw: -0.5, pitch: 1.0, dist: 175 };
    // zoomed on a planet with moons (`focus`: its id): the camera looks at it from `near` instead of
    // the Sun from `view.dist`; `target` eases between them
    this.focus = null;
    this.near = 12;
    this.target = new THREE.Vector3();
    this.build();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
  }

  /** Every body, its orbit, the belts, the Sun's glow and a starry background. */
  build() {
    const sc = this.scene;
    sc.background = new THREE.Color(0x05060c);
    sc.add(new THREE.AmbientLight(0xffffff, 0.22));
    const sunLight = new THREE.PointLight(0xfff2d0, 1.6, 0, 0);
    sc.add(sunLight);
    sc.add(stars());

    this.items = new Map(); // id → { body, group (orbit pivot), mesh, hit, label, angle0 }
    let n = 0;
    for (const b of SOLAR) {
      const item = { body: b, angle0: n++ * 2.39996, label: null };
      if (b.type === 'belt') {
        item.mesh = beltPoints(b);
        sc.add(item.mesh);
      } else if (b.type === 'star') {
        item.mesh = new THREE.Mesh(new THREE.SphereGeometry(b.size, 40, 24), new THREE.MeshBasicMaterial({ color: rgb(b.color) }));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc860, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.scale.setScalar(b.size * 6);
        item.mesh.add(glow);
        sc.add(item.mesh);
      } else {
        const mat = new THREE.MeshLambertMaterial({ map: bodyTexture(b), emissive: rgb(b.color), emissiveIntensity: 0.12 });
        item.mesh = new THREE.Mesh(new THREE.SphereGeometry(b.size, 32, 18), mat);
        if (b.ring) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(b.size * 1.3, b.size * 2.2, 64),
            new THREE.MeshBasicMaterial({ color: rgb(b.color), transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
          ring.rotation.x = Math.PI / 2 - (b.ring[1] || 0.4);
          if (b.ring[0] < 1) ring.rotation.y = 1.2; // Uranus: on its side
          item.mesh.add(ring);
        }
        sc.add(item.mesh);
      }
      // what a click catches: a bit bigger than the body (small moons too)
      if (b.type !== 'belt') {
        item.hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(b.size * 1.5, b.type === 'moon' ? 0.55 : 1.1), 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
        item.hit.userData.id = b.id;
        sc.add(item.hit);
      }
      // the orbit
      if (b.orbit > 0 && b.type !== 'belt') {
        const line = orbitLine(b.orbit, b.type === 'moon' ? 0x5a6a88 : 0x3c4a6a, b.type === 'moon' ? 0.35 : 0.5);
        if (b.tilt) line.rotation.x = b.tilt;
        item.orbitLine = line;
        sc.add(line);
      }
      const label = el('div', `map-label is-${b.type}`, b.name);
      label.addEventListener('click', () => this.choose(b.id));
      this.labels.appendChild(label);
      item.label = label;
      this.items.set(b.id, item);
    }
    // the Hive Carrier (its model is built the first time the map is shown)
    {
      const b = CARRIER, item = { body: b, angle0: b.angle, label: null };
      item.mesh = new THREE.Group();
      sc.add(item.mesh);
      item.hit = new THREE.Mesh(new THREE.BoxGeometry(b.length * 1.15, b.size * 1.2, b.size * 1.6), new THREE.MeshBasicMaterial({ visible: false }));
      item.hit.userData.id = b.id;
      sc.add(item.hit);
      item.orbitLine = orbitLine(b.orbit, 0x3c4a6a, 0.3);
      sc.add(item.orbitLine);
      const label = el('div', 'map-label is-carrier', b.name);
      label.addEventListener('click', () => this.select(b.id));
      this.labels.appendChild(label);
      item.label = label;
      this.items.set(b.id, item);
      this.carrierItem = item;
    }
    // the next mission's marker and the selected body's ring
    this.nextRing = marker(0x8fd0ff);
    this.selRing = marker(0xffffff);
    sc.add(this.nextRing, this.selRing);
    this.raycaster = new THREE.Raycaster();
  }

  /** Where body `b` is at map time t (moons round their planet; belts don't move as a whole). */
  place(item, t, out) {
    const b = item.body;
    if (b.type === 'belt' || b.type === 'star') return out.set(0, 0, 0);
    if (b.type === 'carrier') return out.set(Math.cos(b.angle) * b.orbit, 0, Math.sin(b.angle) * b.orbit); // (it stands still)
    const a = item.angle0 + t * b.speed;
    out.set(Math.cos(a) * b.orbit, 0, Math.sin(a) * b.orbit);
    if (b.tilt) out.applyAxisAngle(X_AXIS, b.tilt);
    if (b.parent) {
      const p = this.items.get(b.parent);
      out.add(this.place(p, t, new THREE.Vector3()));
    }
    return out;
  }

  /**
   * Shows the map. `state`: { mode: 'solo' | 'multi', next: id of the next mission, current: the one
   * being played (multiplayer), done: ids finished }. The next mission's card opens at once.
   */
  show(state = {}) {
    this.state = { ...this.state, ...state, done: new Set(state.done || this.state.done) };
    this.root.hidden = false;
    this.heading();
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    }
    this.resize();
    // the carrier only in single player (where it is visited instead of a mission): the multiplayer
    // map keeps to the missions — and stays light for every player's browser
    this.carrierShown = this.state.mode === 'solo';
    if (this.carrierShown) this.ensureCarrier();
    const ci = this.carrierItem;
    ci.mesh.visible = ci.orbitLine.visible = this.carrierShown;
    this.leaveCarrier();
    this.select(this.state.playing || this.state.next || this.state.current, false);
    if (!this.visible) {
      this.visible = true;
      let last = performance.now();
      const loop = (now) => {
        if (!this.visible) return;
        this.time += Math.min(0.1, (now - last) / 1000);
        last = now;
        this.draw();
        this.frame = requestAnimationFrame(loop);
      };
      this.frame = requestAnimationFrame(loop);
    }
  }

  /** A short message over the map (e.g. "Game saved"), gone after `ms`. */
  note(text, ms = 3500) {
    this.noteEl.textContent = text;
    this.noteEl.hidden = false;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => { this.noteEl.hidden = true; }, ms);
  }

  /** The carrier's model on the map (built once, the first time the map is shown). */
  ensureCarrier() {
    if (this.carrier) return;
    this.carrier = CarrierModel.shared();
    const item = this.carrierItem, b = item.body;
    const small = this.carrier.group(b.length / this.carrier.voxels.NX, 2); // (half the detail: it is small here)
    item.mesh.add(small);
    // along its orbit, the bow ahead
    item.mesh.rotation.y = Math.PI - b.angle; // (turned round: the bow to the left and a little down in the first view)
    this.carrierGroups = [small];
    // aboard: the same carrier full size in a scene of its own
    const sc = (this.aboardScene = new THREE.Scene());
    sc.background = new THREE.Color(0x05060c);
    sc.add(stars());
    sc.add(new THREE.AmbientLight(0xffffff, 0.1)); // (dim: the ship's own lights should show)
    sc.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a1408, 0.12));
    const sun = new THREE.DirectionalLight(0xfff2d8, 0.45);
    sun.position.set(-0.6, 0.9, 0.45);
    sc.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.35); // (from low on the other side: the hull's sides and underside not black)
    fill.position.set(0.5, -0.35, -0.8);
    sc.add(fill);
    this.aboardCamera = new THREE.PerspectiveCamera(40, 1, 1, 4000);
  }

  /** Go aboard: the carrier full size, its modules beside it (Back / Esc: the map). */
  enterCarrier() {
    this.ensureCarrier();
    // full size, every voxel: built the first time someone goes aboard
    if (!this.big) {
      this.big = this.carrier.group(1, 1, true); // (with a few real lights)
      this.aboardScene.add(this.big);
      this.carrierGroups.push(this.big);
    }
    this.aboard = true;
    this.aboardView = { yaw: 2.25 - Math.PI, pitch: 0.42, dist: 330 };
    this.root.classList.add('is-aboard');
    this.title.textContent = CARRIER.name;
    this.hint.textContent = 'Drag to turn · wheel to zoom · Esc: back to the map';
    this.back.hidden = false;
    this.labels.hidden = true;
    this.card.replaceChildren();
    this.card.hidden = false;
    this.card.classList.add('is-modules');
    const close = button('×', () => this.leaveCarrier(), 'map-close');
    close.setAttribute('aria-label', 'Back to the map');
    const list = el('ul', 'carrier-modules');
    for (const m of MODULES) {
      const li = el('li', 'carrier-module');
      li.dataset.module = m.id;
      li.append(el('span', 'carrier-module-name', m.name), el('span', 'carrier-module-state', 'Operational ✓'), el('span', 'carrier-module-text', m.text));
      list.append(li);
    }
    this.card.append(close, el('h3', 'map-card-name', 'Modules'), el('p', 'map-card-status', 'All systems operational'), list);
    this.resize();
  }

  /** Back from aboard to the map (with the carrier's card). */
  leaveCarrier() {
    if (!this.aboard) return;
    this.aboard = false;
    this.root.classList.remove('is-aboard');
    this.card.classList.remove('is-modules');
    this.title.textContent = 'Solar system';
    this.labels.hidden = false;
    this.show(this.state);
    this.select(CARRIER.id, false);
  }

  hide() {
    this.visible = false;
    this.focus = null; // (next time: the whole system)
    this.aboard = false;
    this.root.classList.remove('is-aboard');
    this.card.classList.remove('is-modules');
    this.title.textContent = 'Solar system';
    this.labels.hidden = false;
    cancelAnimationFrame(this.frame);
    this.root.hidden = true;
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.aboardCamera) { this.aboardCamera.aspect = w / h; this.aboardCamera.updateProjectionMatrix(); }
  }

  /** One frame: bodies along their orbits, the camera, the markers and the labels. */
  draw() {
    const t = this.time, v = this.view, tmp = new THREE.Vector3();
    if (this.carrier) this.carrier.update(t, this.carrierGroups);
    if (this.aboard) {
      // aboard: only the carrier, the camera round it
      const a = this.aboardView, cp = Math.cos(a.pitch), cam = this.aboardCamera;
      cam.position.set(Math.cos(a.yaw) * cp * a.dist, Math.sin(a.pitch) * a.dist, Math.sin(a.yaw) * cp * a.dist);
      cam.lookAt(0, 0, 0);
      this.renderer.render(this.aboardScene, cam);
      return;
    }
    for (const item of this.items.values()) {
      const b = item.body;
      if (b.type === 'belt') { item.mesh.rotation.y = -t * b.speed; continue; }
      this.place(item, t, tmp);
      item.mesh.position.copy(tmp);
      if (b.type !== 'carrier') item.mesh.rotation.y = t * 0.3;
      else if (item.hit) { item.hit.rotation.y = item.mesh.rotation.y; }
      if (item.hit) item.hit.position.copy(tmp);
      if (b.type === 'moon' && item.orbitLine) item.orbitLine.position.copy(this.place(this.items.get(b.parent), t, new THREE.Vector3()));
    }
    // the camera on a sphere round the Sun
    const cp = Math.cos(v.pitch);
    // zoomed on a planet: the camera follows it round its orbit; back out: the Sun again
    const goal = this.focus ? this.place(this.items.get(this.focus), t, new THREE.Vector3()) : tmp.set(0, 0, 0);
    this.target.lerp(goal, this.focus && this.target.distanceTo(goal) < 0.5 ? 1 : 0.12);
    this.shownDist = this.shownDist ? this.shownDist + ((this.focus ? this.near : v.dist) - this.shownDist) * 0.12 : v.dist;
    const d = this.shownDist;
    this.camera.position.set(this.target.x + Math.cos(v.yaw) * cp * d, this.target.y + Math.sin(v.pitch) * d, this.target.z + Math.sin(v.yaw) * cp * d);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    // markers: the next mission (pulsing) and the selected body
    for (const item of this.items.values()) item.lit = 0;
    this.putRing(this.nextRing, this.state.next, 1.35 + 0.25 * Math.sin(t * 4));
    this.putRing(this.selRing, this.selected, 1);
    for (const item of this.items.values()) if (item.body.type === 'belt') item.mesh.material.size = 0.28 * (item.lit || 1);
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
  }

  /** A flat ring round body `id` (a belt: along its middle). */
  putRing(ring, id, pulse) {
    const item = id && this.items.get(id);
    ring.visible = Boolean(item);
    if (!item) return;
    const b = item.body;
    if (b.type === 'belt') {
      // a belt has no ring: its rocks light up (bigger, pulsing while it is the next mission)
      ring.visible = false;
      item.lit = Math.max(item.lit || 0, ring === this.nextRing ? pulse : 1.25);
    } else {
      ring.position.copy(item.mesh.position);
      ring.scale.setScalar((b.size * 1.6 + 0.35) * pulse);
    }
  }

  /** The names over the bodies (moons' only when near enough or picked). */
  drawLabels() {
    const w = window.innerWidth, h = window.innerHeight, p = new THREE.Vector3();
    for (const item of this.items.values()) {
      const b = item.body, label = item.label;
      if (b.type === 'belt') p.set(0, 0, -(b.orbit + b.width / 2)).applyAxisAngle(Y_AXIS, -this.time * b.speed + 0.6);
      else p.copy(item.mesh.position).add(new THREE.Vector3(0, (b.size || 0) + 0.5, 0));
      p.project(this.camera);
      const moonFar = b.type === 'moon' && (this.shownDist ?? this.view.dist) > 60 && this.selected !== b.id && this.selected !== b.parent && this.focus !== b.parent;
      const off = p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1 || moonFar || (b.type === 'carrier' && !this.carrierShown);
      label.hidden = off;
      if (off) continue;
      label.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px) translate(-50%, -100%)`;
      label.classList.toggle('is-next', b.id === this.state.next);
      label.classList.toggle('is-done', this.state.done.has(b.id));
      label.classList.toggle('is-soon', b.type !== 'carrier' && !this.opts.playable(b.id));
      label.classList.toggle('is-selected', b.id === this.selected);
    }
  }

  /** Mouse and touch: drag turns, wheel / pinch zooms, a click picks a body (or closes the card). */
  bindInput() {
    const c = this.canvas, v = this.view;
    let down = null, pinch = null;
    const pts = new Map();
    c.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      c.setPointerCapture(e.pointerId);
      if (pts.size === 1) down = { x: e.clientX, y: e.clientY, moved: 0 };
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: this.aboard ? this.aboardView.dist : this.focus ? this.near : v.dist }; down = null; }
    });
    c.addEventListener('pointermove', (e) => {
      const last = pts.get(e.pointerId);
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const k = pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        if (this.aboard) this.aboardView.dist = clamp(pinch.dist * k, ABOARD_DIST[0], ABOARD_DIST[1]);
        else if (this.focus) this.near = clamp(pinch.dist * k, NEAR[0], NEAR[1]);
        else v.dist = clamp(pinch.dist * k, DIST[0], DIST[1]);
      } else if (down) {
        down.moved += Math.abs(dx) + Math.abs(dy);
        const w = this.aboard ? this.aboardView : v;
        w.yaw += dx * 0.006;
        w.pitch = this.aboard ? clamp(w.pitch + dy * 0.006, -1.45, 1.45) : clamp(v.pitch + dy * 0.006, PITCH[0], PITCH[1]);
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (down && down.moved <= CLICK_MOVE && e.type === 'pointerup' && !this.aboard) this.pick(e.clientX, e.clientY);
      if (!pts.size) down = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.aboard) this.aboardView.dist = clamp(this.aboardView.dist * Math.exp(e.deltaY * 0.0012), ABOARD_DIST[0], ABOARD_DIST[1]);
      else if (this.focus) this.near = clamp(this.near * Math.exp(e.deltaY * 0.0012), NEAR[0], NEAR[1]);
      else v.dist = clamp(v.dist * Math.exp(e.deltaY * 0.0012), DIST[0], DIST[1]);
    }, { passive: false });
  }

  /** The body under the screen point (x, y), if any: a planet, moon or the Sun, else a belt. */
  pick(x, y) {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.items.values()].filter((i) => i.body.type !== 'carrier' || this.carrierShown).map((i) => i.hit).filter(Boolean));
    if (hits.length) return this.choose(hits[0].object.userData.id);
    // the belts: where the ray meets the orbit plane
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.y) > 1e-4) {
      const k = -ray.origin.y / ray.direction.y;
      if (k > 0) {
        const px = ray.origin.x + ray.direction.x * k, pz = ray.origin.z + ray.direction.z * k, r = Math.hypot(px, pz);
        for (const item of this.items.values()) {
          const b = item.body;
          if (b.type === 'belt' && r >= b.orbit - 1 && r <= b.orbit + b.width + 1) return this.select(b.id);
        }
      }
    }
    this.select(null);
  }

  /**
   * A click on body `id` (or its name): its card — and a planet with moons (or one of its moons)
   * zooms in on that planet and its moons (Back or Esc: the whole system again); anything else zooms out.
   */
  choose(id) {
    this.select(id);
    const b = id && (id === CARRIER.id ? null : bodyById(id));
    const planet = b && (b.type === 'moon' ? b.parent : SOLAR.some((m) => m.parent === b.id) ? b.id : null);
    if (planet) this.zoomTo(planet);
    else this.zoomOut(); // (anything else: the whole system)
  }

  /** The hint and Back over the map (the whole system, or zoomed on a planet). */
  heading() {
    const b = this.focus && bodyById(this.focus);
    this.back.hidden = this.state.mode !== 'solo' && !b;
    this.hint.textContent = b
      ? `${b.name} and its moons · drag to turn · wheel to zoom · Back / Esc: the whole system`
      : this.state.playing
      ? 'Drag to turn · wheel to zoom · click a body · M / Esc: back to the game'
      : this.state.mode === 'solo'
      ? 'Drag to turn · wheel to zoom · click a body'
      : 'Missions go in order, from the outside in';
  }

  /** Zooms in on planet `id` and its moons. */
  zoomTo(id) {
    const b = bodyById(id), far = Math.max(...SOLAR.filter((m) => m.parent === id).map((m) => m.orbit));
    this.focus = id;
    this.near = clamp(far * 3.4 + b.size * 4, 7, 40);
    this.heading();
  }

  /** Back to the whole solar system. */
  zoomOut() {
    if (!this.focus) return false;
    this.focus = null;
    this.heading();
    return true;
  }

  /** Opens the card of body `id` (null closes it). */
  select(id, focus = true) {
    this.selected = id;
    if (id === CARRIER.id) return this.carrierCard(focus);
    const b = id && bodyById(id);
    this.card.hidden = !b;
    if (!b) return;
    this.card.replaceChildren();
    const pic = el('canvas', 'map-pic');
    pic.width = pic.height = 192;
    paintBody(pic.getContext('2d'), b);
    const close = button('×', () => this.select(null), 'map-close');
    close.setAttribute('aria-label', 'Close');
    const done = this.state.done.has(b.id), playable = this.opts.playable(b.id), next = b.id === this.state.next;
    const playing = b.id === this.state.playing; // (opened with M during this mission)
    const status = playing ? 'Now playing' : done ? 'Completed ✓' : next ? 'Next mission' : b.id === this.state.current ? 'Now' : '';
    const head = el('div', 'map-card-head');
    head.append(pic, el('div', 'map-card-names'));
    head.lastChild.append(el('h3', 'map-card-name', b.name), el('p', 'map-card-kind', b.kind));
    if (status) head.lastChild.append(el('p', 'map-card-status', status));
    this.card.append(close, head, el('p', 'map-card-text', b.text), el('p', 'map-card-task', taskOf(b)));
    if (!playable) {
      const soon = button('Coming soon', () => {}, 'menu-start map-start');
      soon.disabled = true;
      this.card.append(soon);
    } else if (this.state.mode === 'solo') {
      const start = playing
        ? button('Back to it', () => this.opts.onBack(), 'menu-start map-start')
        : button('Start', () => this.opts.onStart(b.id), 'menu-start map-start');
      this.card.append(start);
      if (focus) start.focus();
    } else this.card.append(el('p', 'menu-note', 'In multiplayer the missions go in order; this one starts with the room.'));
  }
}

Object.defineProperty(SolarMap.prototype, 'carrierCard', {
  /** The carrier's card: a picture from above, what it is, Go aboard. */
  value(focus) {
    const b = CARRIER;
    this.card.hidden = false;
    this.card.replaceChildren();
    const pic = el('canvas', 'map-pic');
    pic.width = pic.height = 192;
    paintCarrier(pic.getContext('2d'), 192);
    const close = button('×', () => this.select(null), 'map-close');
    close.setAttribute('aria-label', 'Close');
    const head = el('div', 'map-card-head');
    head.append(pic, el('div', 'map-card-names'));
    head.lastChild.append(el('h3', 'map-card-name', b.name), el('p', 'map-card-kind', b.kind), el('p', 'map-card-status', 'All systems operational'));
    const go = button('Go aboard', () => this.enterCarrier(), 'menu-start map-start');
    this.card.append(close, head, el('p', 'map-card-text', b.text), go);
    if (focus) go.focus();
  },
});

const ABOARD_DIST = [90, 700];
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rgb = ([r, g, b]) => new THREE.Color(r / 255, g / 255, b / 255);

/** A circle on the orbit plane. */
function orbitLine(r, color, opacity) {
  const pts = [];
  for (let i = 0; i < 160; i++) { const a = (i / 160) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

/** A thin flat ring of radius 1 (scaled to the body), for the markers. */
function marker(color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

/** A belt: small points scattered in a flat ring. */
function beltPoints(b) {
  const n = Math.round(b.width * b.orbit * 7), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = b.orbit + Math.random() * b.width, k = 0.6 + Math.random() * 0.5;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - 0.5) * b.width * 0.15; pos[i * 3 + 2] = Math.sin(a) * r;
    col[i * 3] = (b.color[0] / 255) * k; col[i * 3 + 1] = (b.color[1] / 255) * k; col[i * 3 + 2] = (b.color[2] / 255) * k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, vertexColors: true }));
}

/** Far stars. */
function stars() {
  const n = 2500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u), r = 700 + Math.random() * 300;
    pos[i * 3] = q * Math.cos(a) * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = q * Math.sin(a) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.3, color: 0xbfd0ff, sizeAttenuation: false }));
}

/** The Sun's glow. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.25, 'rgba(255,190,90,0.6)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** A body's surface for the map: bands on the giants, land and ice on Earth, caps on Mars, spots elsewhere. */
function bodyTexture(b) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  paintSurface(c.getContext('2d'), b, 128, 64);
  return new THREE.CanvasTexture(c);
}

function paintSurface(g, b, w, h) {
  const [r, gg, bb] = b.color;
  const col = (k, a = 1) => `rgba(${Math.round(r * k)},${Math.round(gg * k)},${Math.round(bb * k)},${a})`;
  g.fillStyle = col(1);
  g.fillRect(0, 0, w, h);
  let seed = [...b.id].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (b.size > 1.2) {
    // giants: bands
    for (let y = 0; y < h; y += 3 + rnd() * 5) {
      g.fillStyle = col(0.8 + rnd() * 0.35, 0.7);
      g.fillRect(0, y, w, 2 + rnd() * 4);
    }
    if (b.id === 'jupiter') { g.fillStyle = 'rgba(190,90,60,0.9)'; g.beginPath(); g.ellipse(w * 0.65, h * 0.62, 9, 5, 0, 0, Math.PI * 2); g.fill(); }
  } else if (b.id === 'earth') {
    g.fillStyle = 'rgb(28,70,150)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { g.fillStyle = rnd() < 0.7 ? 'rgb(70,130,64)' : 'rgb(160,140,90)'; g.beginPath(); g.ellipse(rnd() * w, h * 0.2 + rnd() * h * 0.6, 6 + rnd() * 12, 4 + rnd() * 8, rnd() * 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(236,240,245,1)'; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(rnd() * w, rnd() * h, 10 + rnd() * 20, 2 + rnd() * 2); }
  } else {
    for (let i = 0; i < 24; i++) { g.fillStyle = col(0.7 + rnd() * 0.5, 0.6); g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 5, 0, Math.PI * 2); g.fill(); }
    if (b.id === 'mars') { g.fillStyle = 'rgba(240,240,240,0.95)'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 3, w, 3); }
  }
}

/** The card's picture of a body (a lit ball, with rings; a belt: a scatter of rocks; the Sun: a glow). */
function paintBody(g, b) {
  const W = 192, cx = W / 2, cy = W / 2;
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, W, W);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(200,215,255,${0.2 + Math.random() * 0.5})`; g.fillRect(Math.random() * W, Math.random() * W, 1, 1); }
  const [r, gg, bb] = b.color;
  if (b.type === 'belt') {
    for (let i = 0; i < 46; i++) {
      const x = 14 + Math.random() * (W - 28), y = 30 + Math.random() * (W - 60), s = 2 + Math.random() * 9, k = 0.6 + Math.random() * 0.6;
      g.fillStyle = `rgb(${r * k | 0},${gg * k | 0},${bb * k | 0})`;
      g.beginPath();
      for (let q = 0; q < 7; q++) { const a = (q / 7) * Math.PI * 2, rr = s * (0.7 + Math.random() * 0.5); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
    return;
  }
  const R = b.type === 'star' ? 62 : 58;
  if (b.type === 'star') {
    const glow = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.5);
    glow.addColorStop(0, 'rgba(255,200,90,0.8)'); glow.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, W);
  }
  if (b.ring) ringHalf(g, b, cx, cy, R, true);
  // the surface, then the shading over it
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  const surf = document.createElement('canvas');
  surf.width = 128; surf.height = 64;
  paintSurface(surf.getContext('2d'), b, 128, 64);
  g.drawImage(surf, 0, 0, 64, 64, cx - R, cy - R, R * 2, R * 2);
  if (b.type !== 'star') {
    const shade = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05);
    shade.addColorStop(0, 'rgba(255,255,255,0.18)'); shade.addColorStop(0.6, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = shade; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  g.restore();
  if (b.ring) ringHalf(g, b, cx, cy, R, false);
}

/** Saturn's / Uranus' ring in the picture: the back half before the ball, the front half after it. */
function ringHalf(g, b, cx, cy, R, back) {
  const [r, gg, bb] = b.color;
  g.save();
  g.translate(cx, cy);
  g.rotate(b.ring[0] < 1 ? 1.2 : -0.35);
  g.strokeStyle = `rgba(${r},${gg},${bb},0.7)`;
  for (let k = 0; k < 3; k++) {
    g.lineWidth = 5 - k;
    g.beginPath();
    g.ellipse(0, 0, R * (1.45 + k * 0.18), R * (0.32 + k * 0.04), 0, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI);
    g.stroke();
  }
  g.restore();
}
