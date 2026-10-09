import { CONFIG } from '../config.js';
import { VoxelPlanet } from './VoxelPlanet.js';
import { Debris3D } from './Debris3D.js';
import { Space3D } from './Space3D.js';
import { ClickMarker } from './ClickMarker.js';
import { Player } from './Player.js';
import { Lightning3D } from './Lightning3D.js';

const THREE = window.THREE;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Player colours and names in multiplayer (index 0 is the host). */
export const PLAYERS = [
  { name: 'Blue', color: 0x8fd0ff },
  { name: 'Pink', color: 0xff8fc8 },
  { name: 'Green', color: 0xa8ff8f },
  { name: 'Violet', color: 0xc9a6ff },
];

/**
 * The game. Each player's swarm acts on its own; a click / tap gives it a target, a click on
 * its beacon calls it back home. Right button / two fingers = rotate the camera, wheel = zoom.
 *
 * Roles:
 *  - 'solo'  — single player, everything runs here;
 *  - 'host'  — multiplayer host: simulates the planet and every player's swarm;
 *  - 'guest' — multiplayer guest: builds the same planet from the host's seed, shows what
 *              the host sends and sends its own clicks and settings to the host.
 *
 * Planet spin: the simulation stays in the planet's frame (voxels never move), and the
 * camera, sky, sun and beacons turn around it instead — on screen the planet rotates.
 */
export class Game3D {
  constructor(container, hud, { role = 'solo' } = {}) {
    this.cfg = CONFIG;
    this.hud = hud;
    this.role = role;
    this.mode = null;        // multiplayer: 'coop' | 'pvp'
    this.net = null;         // NetHost / NetGuest
    this.level = 0;
    this.running = false;    // the render loop is on
    this.started = false;    // the match has begun (start screen / waiting room before that)
    this.spin = 0;           // planet rotation angle (radians)
    this.remoteSpin = 0;     // guest: spin from the host
    this.returnFrames = 0;
    this.frameNo = 0;
    this.players = [];       // index = player index
    this.localIndex = 0;
    this.banner = '';        // message shown in the HUD (e.g. who won the planet)
    this.remote = { left: 0, total: 1 }; // guest: planet progress from the host
    this.netStats = [];      // multiplayer: [{index, host} | {index, rtt, rate}] from the host
    this.notices = [];       // short HUD messages: [{text, until}]
    this.summary = null;     // multiplayer: results of the planet just eaten (see buildSummary)
    this.onSummaryChange = null; // (summary | null) => void — the UI shows / updates / hides it

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.cfg.background);
    this.camera = new THREE.PerspectiveCamera(this.cfg.fov, 1, 0.1, 3000);

    const [lx, ly, lz] = this.cfg.planet.light;
    this.sun = new THREE.DirectionalLight(0xffffff, 0.95);
    this.sunBase = new THREE.Vector3(lx, ly, lz).multiplyScalar(100);
    this.sun.position.copy(this.sunBase);
    this.scene.add(this.sun, new THREE.AmbientLight(0xffffff, 0.14));

    this.space = new Space3D(this.scene, this.cfg.space);

    // camera on a sphere around the planet centre
    this.orbit = { theta: 0, phi: Math.PI / 2, distance: this.cfg.camera.distance };
    this.updateCamera();

    this.raycaster = new THREE.Raycaster();
    this.tmp = new THREE.Vector3();
    this.debris = new Debris3D(this.scene, this.cfg.debris);
    this.marker = new ClickMarker(this.scene, this.cfg.marker);
    this.lightning = new Lightning3D(this.scene);
    this.onTreeChange = null; // () => void — the upgrade tree view refreshes

    this.resize(); // camera aspect is needed to keep the spawn point on screen
    this.baseSpawn = this.spawnPoint();

    if (role !== 'guest') {
      this.spawnPlanet();
      this.addPlayer(0);
    }

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
  }

  get localPlayer() {
    return this.players[this.localIndex];
  }

  get multiplayer() {
    return this.role !== 'solo';
  }

  /**
   * Spawn point at a distance from the planet's surface of about the planet's size
   * (spawnGap × radius). The direction is chosen so the swarm is on screen, on the left
   * (away from the panel): as far to the side as the screen allows, more in front of the
   * planet on narrow screens.
   */
  spawnPoint() {
    const r = this.cfg.planet.radius * (1 + this.cfg.swarm.spawnGap);
    const toCam = this.camera.position.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const left = new THREE.Vector3(-1, 0, 0).applyQuaternion(this.camera.quaternion);
    const side = left.multiplyScalar(1).add(up.multiplyScalar(0.3)).normalize();
    const p = new THREE.Vector3();
    for (let deg = 85; deg >= 5; deg -= 5) {
      const a = (deg * Math.PI) / 180;
      p.copy(toCam).multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).multiplyScalar(r);
      const ndc = p.clone().project(this.camera);
      if (Math.abs(ndc.x) < 0.8 && Math.abs(ndc.y) < 0.7 && ndc.z < 1) break;
    }
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Turn of spawn slot `slot` out of `total` players: spread evenly around the planet. */
  slotAngle(slot, total) {
    return total > 0 ? (slot * 2 * Math.PI) / total : 0;
  }

  /** Spawn point for slot `slot` of `total` (in the space frame): the base spawn turned around the planet. */
  spawnFor(slot, total = 1) {
    const v = new THREE.Vector3(this.baseSpawn.x, this.baseSpawn.y, this.baseSpawn.z).applyAxisAngle(Y_AXIS, this.slotAngle(slot, total));
    return { x: v.x, y: v.y, z: v.z };
  }

  /**
   * Host: spread every player's spawn evenly around the planet — 2 players opposite each
   * other, 3 a third of a turn apart, 4 a quarter. Called whenever someone joins or leaves.
   * The host keeps slot 0, so its own spawn never moves.
   */
  layoutSpawns() {
    const list = this.activePlayers();
    list.forEach((p, slot) => {
      p.setSpawn(this.spawnFor(slot, list.length));
    });
  }

  playerInfo(index) {
    const look = PLAYERS[index];
    // the slot this player will take among everyone in the game (players are ordered by index)
    const indices = [...new Set([...this.activePlayers().map((p) => p.index), index])].sort((a, b) => a - b);
    return {
      index,
      name: look.name,
      color: look.color,
      // single player keeps the amber beacon; in multiplayer each beacon has its player's colour
      beaconColor: this.multiplayer ? look.color : this.cfg.beacon.color,
      spawn: this.spawnFor(indices.indexOf(index), indices.length),
    };
  }

  addPlayer(index, info = this.playerInfo(index)) {
    this.removePlayer(index);
    const p = new Player(this, info);
    this.players[index] = p;
    return p;
  }

  removePlayer(index) {
    const p = this.players[index];
    if (!p) return;
    p.dispose();
    this.players[index] = undefined;
  }

  /** Every player that is in the game. */
  activePlayers() {
    return this.players.filter(Boolean);
  }

  /** Switch from single player to hosting a room (keeps the current planet and swarm). */
  becomeHost(mode) {
    this.role = 'host';
    this.mode = mode;
    this.localPlayer.beacon.setColor(PLAYERS[0].color);
    this.planet.log = [];
  }

  spawnPlanet(seed) {
    this.level++;
    this.planet = new VoxelPlanet(this.scene, this.cfg.planet, seed, this.levelLook(this.level));
    if (this.role === 'host') this.planet.log = [];
    for (const p of this.activePlayers()) p.onNewPlanet();
    this.banner = '';
  }

  /**
   * Size and graphics of planet `level`: CONFIG.levels repeats in a cycle (planet 5 looks like
   * planet 1, and so on). Every client builds the same planet from the level and the seed.
   */
  levelLook(level) {
    const list = this.cfg.levels;
    const l = list[(level - 1) % list.length];
    return { ...l, radius: this.cfg.planet.radius * (l.radiusScale || 1), style: l.style || 'cubes' };
  }

  // --- input ---

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
  }

  /** A tap on the screen: own beacon → call the swarm back, planet → send the swarm there. */
  onTap(ndc) {
    const me = this.localPlayer;
    if (!me || !this.planet || !this.started) return;
    this.raycaster.setFromCamera(ndc, this.camera);
    if (me.beacon.hitBy(this.raycaster.ray)) {
      if (this.role === 'guest') this.net.sendCommand({ kind: 'recall' });
      else me.recall();
      return;
    }
    if (!this.planet.alive || me.homeMode === 'return') return;
    const point = this.pointFromScreen(ndc);
    this.marker.show(point, this.lastPickHit, this.camera);
    if (this.role === 'guest') this.net.sendCommand({ kind: 'click', p: point });
    else me.command(point);
  }

  /** A setting changed on the local panel. */
  setLocalSetting(key, value) {
    if (this.role === 'guest') this.net.sendSetting(key, value);
    else this.localPlayer.setSetting(key, value);
  }

  toNdc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  updateCamera() {
    const { theta, phi, distance } = this.orbit;
    this.camera.position.setFromSphericalCoords(distance, phi, theta + this.spin);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

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
  }

  /** A feeding unit of `player` eats a small crater around the voxel it sits on. */
  biteCell(idx, ownFood, player) {
    const pl = this.planet;
    // eating takes time: every frame on a bite removes part of its strength
    const damage = this.cfg.planet.strength / this.cfg.swarm.eatFrames;
    pl.biteSphere(idx, player.biteRadius, damage, (n) => {
      player.score++;
      player.planetScore++;
      this.debris.emit(pl.cellCenter(n, this.tmp), pl.colorOf(n), this.cfg.debris.perCell);
    }, ownFood);
  }

  // --- frame ---

  /** Turns the camera, sky, sun and beacons around the planet — on screen the planet spins. */
  applySpin() {
    this.space.group.rotation.y = this.spin;
    this.sun.position.copy(this.sunBase).applyAxisAngle(Y_AXIS, this.spin);
    this.updateCamera();
  }

  update() {
    this.frameNo++;
    if (this.role === 'guest') this.updateGuest();
    else this.updateSim();

    this.debris.update();
    this.marker.update();
    this.lightning.update();
    for (const p of this.activePlayers()) p.beacon.update(this.camera);
    this.updateHud();
  }

  /** Single player and host: run the simulation. */
  updateSim() {
    // the planet starts turning with the match (while waiting, swarms sit at their beacons)
    if (this.started) this.spin += this.cfg.planet.spinSpeed;
    this.applySpin();
    const players = this.activePlayers();
    // before the start, swarms wait at their beacons
    if (this.started) for (const p of players) p.update();

    const pl = this.planet;
    // the planet counts as eaten only when its last voxel is gone; then every swarm flies home
    if (this.started && pl.alive && pl.left <= 0) {
      pl.shatter((idx, color) => this.debris.emit(pl.cellCenter(idx, this.tmp), color, this.cfg.debris.perCellOnFinish));
      for (const p of players) p.returnHome();
      this.returnFrames = 0;
      this.banner = this.planetResult();
      // multiplayer: a summary for everyone; the next planet waits until every player pressed Next planet
      if (this.multiplayer) {
        for (const p of players) p.nextReady = false;
        this.setSummary(this.buildSummary());
      }
    }
    // back home: the next planet appears once every swarm has gathered at its beacon
    // (and, in multiplayer, everyone has closed the summary with Next planet)
    if (this.started && !pl.alive) {
      this.returnFrames++;
      const home = players.every((p) => p.gatheredAtHome()) || this.returnFrames > this.cfg.beacon.returnTimeoutFrames;
      if (home && (!this.multiplayer || players.every((p) => p.nextReady))) {
        pl.dispose();
        this.spawnPlanet();
        this.setSummary(null);
        this.net?.broadcastPlanet(this);
      }
    }
    this.planet.sync();
    if (this.role === 'host' && this.frameNo % this.cfg.net.snapshotEvery === 0) this.net?.broadcastSnapshot(this);
  }

  /**
   * Results of the planet just eaten, for the summary screen: per player the voxels eaten of
   * this planet, their share, the total and planets won; the PvP winner; who pressed Next planet.
   */
  buildSummary() {
    const players = this.activePlayers();
    const total = this.planet.total || 1;
    const rows = players.map((p) => ({
      index: p.index, name: p.name, color: p.color, planet: p.planetScore,
      share: Math.round((p.planetScore / total) * 1000) / 10, score: p.score, wins: p.wins, next: Boolean(p.nextReady),
    })).sort((a, b) => b.planet - a.planet);
    const winner = this.mode === 'pvp' && rows.length ? rows[0].index : null;
    return { level: this.level, mode: this.mode, winner, rows };
  }

  /** Shows (or with null hides) the summary here and on the guests' screens. */
  setSummary(summary) {
    this.summary = summary;
    if (this.role === 'host' && summary) this.net?.broadcastSummary(summary);
    this.onSummaryChange?.(summary);
  }

  /** Draws a chain-lightning bolt (and, on the host, sends it to the guests). */
  showBolt(player, path) {
    this.lightning.show(path, player.color);
    if (this.role === 'host') this.net?.broadcastBolt(player.index, path);
  }

  /** A guest sees a bolt the host fired. */
  onBolt({ index, p }) {
    const player = this.players[index];
    if (player) this.lightning.show(p, player.color);
  }

  /**
   * Buys an upgrade for the local player. A guest asks the host (which owns the game) and
   * gets its tree back in a 'tree' message.
   */
  buyUpgrade(id) {
    const me = this.localPlayer;
    if (!me) return false;
    if (this.role === 'guest') {
      this.net.sendBuy(id);
      return true;
    }
    const ok = me.buy(id);
    if (ok) this.onTreeChange?.();
    return ok;
  }

  /** Host: a guest wants to buy an upgrade; returns the guest's tree to send back. */
  onGuestBuy(index, id) {
    const p = this.players[index];
    if (!p) return null;
    p.buy(id);
    return p.tree.toJSON();
  }

  /** Guest: our tree from the host after a purchase. */
  onTree(tree) {
    this.localPlayer?.tree.load(tree);
    this.onTreeChange?.();
  }

  /** Player `index` pressed Next planet on the summary (host / via a guest's message). */
  nextPlanetReady(index) {
    const p = this.players[index];
    if (!p || !this.summary || p.nextReady) return;
    p.nextReady = true;
    this.setSummary({ ...this.summary, rows: this.summary.rows.map((r) => ({ ...r, next: Boolean(this.players[r.index]?.nextReady) })) });
  }

  /** Who won the planet (PvP) or a summary (co-op / single player). */
  planetResult() {
    const players = this.activePlayers();
    if (!this.multiplayer) return '';
    if (this.mode === 'pvp') {
      const best = players.reduce((a, b) => (b.planetScore > a.planetScore ? b : a));
      best.wins++;
      return `${best.name} wins planet ${this.level}`;
    }
    return `Planet ${this.level} eaten together`;
  }

  /** Guest: show what the host sends. */
  updateGuest() {
    // the planet keeps turning between updates; small differences are eased out
    if (this.started) {
      this.remoteSpin += this.cfg.planet.spinSpeed;
      this.spin += this.cfg.planet.spinSpeed;
    }
    const ds = this.remoteSpin - this.spin;
    this.spin = Math.abs(ds) > 0.05 ? this.remoteSpin : this.spin + ds * 0.1;
    this.applySpin();
    for (const p of this.activePlayers()) p.swarm.followRemote(this.cfg.net.follow);
    if (this.planet) {
      if (this.planet.alive && this.planet.left <= 0) {
        this.planet.shatter((idx, color) => this.debris.emit(this.planet.cellCenter(idx, this.tmp), color, this.cfg.debris.perCellOnFinish));
      }
      this.planet.sync();
    }
  }

  // --- multiplayer: host side ---

  /** First free player slot (1–3) or -1 when the room is full. */
  freeSlot() {
    for (let i = 1; i < PLAYERS.length; i++) if (!this.players[i]) return i;
    return -1;
  }

  /** A guest's command or setting arrived at the host. */
  onGuestMessage(index, msg) {
    const p = this.players[index];
    if (!p) return;
    if (msg.t === 'cmd' && msg.kind === 'click' && msg.p) p.command(msg.p);
    else if (msg.t === 'cmd' && msg.kind === 'recall') p.recall();
    else if (msg.t === 'set') p.setSetting(msg.key, msg.value);
    else if (msg.t === 'next') this.nextPlanetReady(index);
  }

  // --- multiplayer: guest side ---

  /** The host accepted us (the players and our spawn arrive in the next 'players' message). */
  onWelcome(msg) {
    this.mode = msg.mode;
    this.localIndex = msg.index;
    this.cameraAimed = false;
  }

  /**
   * Player list from the host (someone joined or left): add and remove players and move
   * the beacons to their new, evenly spread spawns. The first time we see our own spawn,
   * the camera turns to face it. `started`: whether the match has begun.
   */
  onPlayers(list, started = false) {
    this.started = Boolean(started);
    const seen = new Set();
    list.forEach((info, slot) => {
      seen.add(info.index);
      const p = this.players[info.index] || this.addPlayer(info.index, info);
      p.setSpawn(info.spawn);
      p.ready = Boolean(info.ready);
      if (info.index === this.localIndex && !this.cameraAimed) {
        this.orbit.theta = this.slotAngle(slot, list.length);
        this.cameraAimed = true;
        this.updateCamera();
      }
    });
    for (let i = 0; i < this.players.length; i++) if (this.players[i] && !seen.has(i)) this.removePlayer(i);
  }

  /** A planet from the host: same seed = same planet; `bits` = which voxels are still there. */
  onPlanet({ seed, level, bits }) {
    if (this.planet) this.planet.dispose();
    this.level = level - 1;
    this.spawnPlanet(seed);
    if (bits) this.planet.applySolidBits(bits);
    this.planet.sync();
    if (this.summary) this.setSummary(null);
  }

  /** A state update from the host. */
  onSnapshot(s) {
    this.remoteSpin = s.spin;
    this.remote.left = s.left;
    this.banner = s.banner;
    for (const ps of s.players) {
      const p = this.players[ps.index];
      if (!p) continue;
      p.homeMode = ps.home === 1 ? 'recall' : ps.home === 2 ? 'return' : null;
      p.beacon.active = ps.home !== 0;
      p.score = ps.score;
      p.planetScore = ps.planetScore;
      p.wins = ps.wins;
      p.swarm.setRemote(ps.count, ps.pos, ps.dir);
    }
    const pl = this.planet;
    if (pl && pl.alive) {
      for (const idx of s.removed) {
        if (pl.hp[idx] > 0) {
          this.debris.emit(pl.cellCenter(idx, this.tmp), pl.colorOf(idx), this.cfg.debris.perCell);
          pl.remove(idx);
        }
      }
    }
  }

  // --- HUD ---

  /** A short message in the HUD (someone joined, left, lost the connection). */
  notify(text) {
    this.notices.push({ text, until: performance.now() + this.cfg.net.noticeMs });
    if (this.notices.length > 4) this.notices.shift();
  }

  /** Connection stats of player `index` from the host (undefined until the first update). */
  statsOf(index) {
    return this.netStats.find((s) => s.index === index);
  }

  updateHud() {
    const me = this.localPlayer;
    const pl = this.planet;
    let eaten = 0;
    if (pl) eaten = !pl.alive ? 1 : 1 - pl.left / pl.total;
    const hint = !me ? 'connecting…'
      : me.homeMode === 'return'
        ? 'planet eaten — returning to the beacon'
        : me.homeMode === 'recall'
          ? 'called back · click the planet to send the swarm out again'
          : 'click: steer the swarm · click the beacon: call it back · right button / two fingers: rotate · wheel: zoom'
            + (this.multiplayer ? '' : ' · Menu (bottom left): pause');

    const scores = this.multiplayer
      ? this.activePlayers().map((p) => ({
        name: p.name,
        color: p.color,
        score: p.score,
        planetScore: p.planetScore,
        wins: p.wins,
        local: p.index === this.localIndex,
        net: this.statsOf(p.index),
      }))
      : null;
    const now = performance.now();
    this.notices = this.notices.filter((n) => n.until > now);
    this.hud.update({ level: this.level, eaten, hint, mode: this.mode, scores, banner: this.banner,
      points: me ? me.points : null,
      notices: this.notices.map((n) => n.text) });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // on a narrow (portrait) screen keep the horizontal field of view so the planet fits
    const half = (this.cfg.fov / 2) * (Math.PI / 180);
    this.camera.fov = aspect < 1 ? (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI : this.cfg.fov;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    const loop = () => {
      if (!this.running) return;
      this.update();
      for (const p of this.activePlayers()) p.swarm.render();
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }
}
