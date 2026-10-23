import { CONFIG, SHIP_KINDS, kindConfig } from '../../config.js';
import { VoxelPlanet } from '../planet/VoxelPlanet.js';
import { Debris3D } from '../effects/Debris3D.js';
import { Space3D } from '../scene/Space3D.js';
import { ClickMarker } from '../scene/ClickMarker.js';
import { Lightning3D } from '../effects/Lightning3D.js';
import { BlackHoles } from '../effects/BlackHoles.js';
import { Orbs } from '../effects/Orbs.js';
import { Shots } from '../effects/Shots.js';
import { Bubbles } from '../effects/Bubbles.js';
import { Zaps } from '../effects/Zaps.js';
import { Liquids } from '../effects/Liquids.js';
import { Gases } from '../effects/Gases.js';
import { LIQUID_TIME } from '../liquidShader.js';
import { Player } from './Player.js';
import { PLAYERS } from './players.js';
import { Input } from './input.js';
import { Destruction } from './destruction.js';
import { HostSide } from './host.js';
import { GuestSide } from './guest.js';
import { HudText } from './hud.js';
import { Graphics } from './graphics.js';
import { settings } from '../../settings.js';
import { bytesToText, textToBytes } from '../../save.js';

export { PLAYERS };

const THREE = window.THREE;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * The game. Each player's swarm acts on its own; a click / tap gives it a target, a click on
 * its tunnel calls it back home. Right button / two fingers = rotate the camera, wheel = zoom.
 *
 * Roles:
 *  - 'solo'  — single player, everything runs here;
 *  - 'host'  — multiplayer host: simulates the planet and every player's swarm;
 *  - 'guest' — multiplayer guest: builds the same planet from the host's seed, shows what
 *              the host sends and sends its own clicks and settings to the host.
 *
 * Planet spin: the simulation stays in the planet's frame (voxels never move), and the
 * camera, sky, sun and tunnels turn around it instead — on screen the planet rotates.
 *
 * This file: setting up, players and spawns, planets, the frame loop. The rest of the class is in
 * input.js (mouse, touch, camera), destruction.js (what ships do to voxels), host.js and guest.js
 * (multiplayer) and hud.js.
 */
export class Game3D {
  constructor(container, hud, { role = 'solo' } = {}) {
    this.cfg = CONFIG;
    this.hud = hud;
    this.role = role;
    this.mode = null;        // multiplayer: 'coop' | 'pvp'
    this.net = null;         // NetHost / NetGuest
    this.level = 0;          // planets so far (the summary's number; in multiplayer it also picks the mission)
    this.mission = 0;        // single player: the mission being played (an index into CONFIG.levels)
    this.onMissionDone = null; // single player: (body id) => void — a mission's planet was eaten and the ships are gone
    this.running = false;    // the render loop is on
    this.started = false;    // the match has begun (start screen / waiting room before that)
    this.paused = false;     // single player: paused with Space
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

    this.renderer = null;
    this.fps = 0;            // frames per second (the FPS counter), see countFrame
    this.makeRenderer(container); // resolution and smooth edges from the Settings menu (graphics.js)

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
    this.orbit = { q: new THREE.Quaternion(), distance: this.cfg.camera.distance }; // see updateCamera
    this.updateCamera();

    this.raycaster = new THREE.Raycaster();
    this.tmp = new THREE.Vector3();
    this.group = 'eaters'; // the group of ships a click sends (chosen in the ship bar)
    this.debris = new Debris3D(this.scene, this.cfg.debris);
    this.marker = new ClickMarker(this.scene, this.cfg.marker);
    this.lightning = new Lightning3D(this.scene);
    this.holes = new BlackHoles(this.cfg.holes);
    this.orbs = new Orbs(this.scene, this.cfg.swarm.orb, this.cfg.planet.voxelSize);
    this.shots = new Shots(this.scene, this.cfg.swarm.sniper, this.cfg.planet.voxelSize);
    this.bubbles = new Bubbles(this.cfg.swarm.splasher);
    this.soaks = []; // blocks soaking where a splasher's bubble landed (host), see splash()
    this.zaps = new Zaps(this.scene, this.cfg.swarm.support);
    this.liquids = new Liquids(this.scene, this.cfg.liquids); // droplets of liquid voxels let loose (the test board)
    this.gases = new Gases(this.scene, this.cfg.gas); // clouds of gas voxels let loose (the test board)
    this.debris.scale = this.orbs.scale = this.effectsScale; // Settings → Graphics → Effects
    settings.onChange((key) => this.applyGraphics(key));
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
      spawn: this.spawnFor(indices.indexOf(index), indices.length),
    };
  }

  addPlayer(index, info = this.playerInfo(index)) {
    this.removePlayer(index);
    const p = new Player(this, info);
    this.players[index] = p;
    // its bombers blew up: fewer units — a guest's panel is told by the host
    p.onLost = () => {
      if (this.role === 'host' && index !== this.localIndex) this.net?.sendSettings(index, { count: p.base.count, bombers: p.bombers });
    };
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

  /** Switch to hosting a room: starts from scratch (new planet 1 and host player), keeps the settings panel values. */
  becomeHost(mode) {
    this.role = 'host';
    this.paused = false;
    this.mode = mode;
    // a room starts from scratch — nothing carries over from single player (planet, points,
    // upgrades, swarm), so co-op and PvP are fair; only the settings panel values stay
    const old = this.localPlayer;
    const keep = ['count', 'speed', 'power', 'turn', ...SHIP_KINDS].map((k) => [k, old.getSetting(k)]);
    this.removePlayer(0);
    this.planet.dispose();
    this.level = 0;
    this.spin = 0;
    this.banner = '';
    this.spawnPlanet();
    const p = this.addPlayer(0);
    for (const [k, v] of keep) p.setSetting(k, v);
    this.planet.log = [];
  }

  /**
   * Single player: build mission `n` (1 = the first of CONFIG.levels) right away (the level switch in
   * the panel, Start on the map). The swarm starts again from its tunnel, so it can't end up inside the new shape.
   */
  jumpToLevel(n) {
    if (this.role !== 'solo') return;
    this.planet.dispose();
    this.mission = (n - 1) % this.cfg.levels.length;
    this.level = n - 1;
    this.spawnPlanet();
    this.returnFrames = 0;
    for (const p of this.activePlayers()) {
      p.swarm.hungry.fill(0);
      p.swarm.pause.fill(0);
      p.placeAtSpawn();
    }
  }

  /**
   * Single player: Start on the map — mission of body `id` begins (false if it can't be played yet).
   * The camera starts turned the level's `view` radians round (the Kuiper Belt: seen at an angle).
   */
  startMission(id) {
    const n = this.cfg.levels.findIndex((l) => l.body === id);
    if (this.role !== 'solo' || n < 0) return false;
    this.jumpToLevel(n + 1);
    this.faceAngle(this.cfg.levels[n].view || 0);
    this.paused = false;
    this.started = true;
    return true;
  }

  /**
   * Single player: the test board (Dev tools) — `testBoard` in CONFIG (Earth) again and again: eaten,
   * the ships jump and it is there again; every player starts with `testBoard.each` ships of every type
   * (eaters too), no points or upgrades kept, nothing saved, the map gets no ticks. `leaveTestBoard`
   * puts the ships back as at the start.
   */
  startTestBoard() {
    if (this.role !== 'solo') return false;
    this.testBoard = true;
    this.boardsEaten = 0;
    this.resetProgress();
    const p = this.localPlayer, each = this.cfg.testBoard.each;
    p.setSetting('count', each * (SHIP_KINDS.length + 1));
    for (const k of SHIP_KINDS) p.setSetting(k, each);
    this.planet.dispose();
    this.level = 0;
    this.spawnPlanet();
    this.returnFrames = 0;
    p.placeAtSpawn();
    this.faceAngle(this.cfg.testBoard.view || 0);
    this.paused = false;
    this.started = true;
    return true;
  }

  leaveTestBoard() {
    if (!this.testBoard) return;
    this.testBoard = false;
    const p = this.localPlayer, S = this.cfg.swarm;
    p.setSetting('count', S.count);
    for (const k of SHIP_KINDS) p.setSetting(k, S[kindConfig(k)].count);
    this.resetProgress();
  }

  /**
   * Single player: what "Save and exit" keeps — the mission under way (its body, the planet's seed and
   * the voxels eaten so far; drifting pieces go back in place), points and upgrades, the settings
   * panel and the ship types. The swarm starts again from its tunnel when it is loaded.
   */
  saveData(inMission = true) {
    const p = this.localPlayer, pl = this.planet;
    const mission = inMission ? this.bodyId : null;
    return {
      mission, seed: pl.seed, eaten: mission ? bytesToText(pl.eatenRuns()) : '',
      score: p.score, planetScore: p.planetScore, tree: p.tree.toJSON(),
      settings: Object.fromEntries(['count', 'speed', 'power', 'turn', ...SHIP_KINDS].map((k) => [k, p.getSetting(k)])),
    };
  }

  /** Single player: Continue — back to a saved game. True if a mission was under way (it carries on). */
  loadSave(data) {
    const p = this.localPlayer;
    for (const [k, v] of Object.entries(data.settings || {})) p.setSetting(k, v);
    p.tree.load(data.tree || { owned: ['core'], spent: 0 });
    p.score = data.score || 0;
    p.applyUpgrades();
    this.onTreeChange?.();
    const n = this.cfg.levels.findIndex((l) => l.body === data.mission);
    if (n < 0) return false;
    this.planet.dispose();
    this.mission = n;
    this.level = n;
    this.spawnPlanet(data.seed);
    if (data.eaten) this.planet.applyEatenRuns(textToBytes(data.eaten));
    this.planet.sync();
    p.planetScore = data.planetScore || 0;
    this.returnFrames = 0;
    this.faceAngle(this.cfg.levels[n].view || 0);
    this.paused = false;
    this.started = true;
    return true;
  }

  /** Single player: a new game — no points, no upgrades (the settings panel stays). */
  resetProgress() {
    const p = this.localPlayer;
    p.tree.load({ owned: ['core'], spent: 0 });
    p.score = 0;
    p.planetScore = 0;
    p.applyUpgrades();
    this.onTreeChange?.();
  }

  spawnPlanet(seed) {
    this.level++;
    // orbs, bolts and black holes belonged to the old planet
    this.orbs?.clear();
    this.shots?.clear();
    this.bubbles?.clear();
    if (this.soaks) this.soaks.length = 0;
    this.zaps?.clear();
    this.holes?.clear();
    this.liquids?.clear(); // (droplets and clouds belonged to the old planet)
    this.gases?.clear();
    this.planet = new VoxelPlanet(this.scene, this.cfg.planet, seed, this.levelLook(this.level), this.cfg.fragments);
    if (this.role === 'host') this.planet.log = [];
    this.fitToPlanet();
    const fr = this.planet.fragments;
    if (fr) {
      // pieces come off on the host (and in single player); guests get them from the host
      fr.detect = this.role !== 'guest';
      fr.onCreate = (f, cells) => { if (this.role === 'host') this.net?.broadcastFragment(f, cells); };
    }
    for (const p of this.activePlayers()) p.onNewPlanet();
    this.banner = '';
  }

  /**
   * Liquid and gas voxels gone this frame (VoxelPlanet.spills) are let loose as droplets (Liquids) or
   * puffs of a cloud (Gases). They give
   * no points: whoever ate or destroyed them got a point the usual way, so it is taken back — single
   * player only (liquids are on the test board only, for now), where the local player is the only one.
   */
  takeSpills() {
    const sp = this.planet.spills;
    if (!sp.length) return;
    const v = this.tmp;
    for (const [kind, x, y, z] of sp) {
      v.set(x, y, z);
      // off outwards, roughly, and a little at random (Liquids.spill, Gases.spill)
      const dir = { x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4, z: z + (Math.random() - 0.5) * 4 };
      if (kind === 'gas') this.gases.spill(v, dir);
      else this.liquids.spill(kind, v, dir);
    }
    const me = this.role === 'solo' ? this.localPlayer : null;
    if (me) { me.score = Math.max(0, me.score - sp.length); me.planetScore = Math.max(0, me.planetScore - sp.length); }
    this.spilled = (this.spilled || 0) + sp.length; // (tests)
    sp.length = 0;
  }

  /**
   * A planet bigger than Earth (`planet.radius`): the tunnels and the camera go out with it — every
   * spawn point and the camera's distance (and its zoom limits) × `sizeScale` (R / planet.radius,
   * at least 1; smaller bodies keep Earth's distances).
   */
  fitToPlanet() {
    const pl = this.planet;
    const scale = pl.sizeScale ?? (pl.shape === 'sphere' ? Math.max(1, pl.R / this.cfg.planet.radius) : 1);
    const was = this.sizeScale || 1;
    this.sizeScale = scale;
    if (scale !== was) {
      this.orbit.distance *= scale / was;
      this.updateCamera();
    }
    for (const p of this.activePlayers()) if (p.spawnBase) p.setSpawn(p.spawnBase);
  }

  /**
   * Which mission planet `level` is (an index into CONFIG.levels): in single player the one picked on
   * the map; in multiplayer they go in order, round again after the last — every client works it out
   * from the planet number.
   */
  missionIndex(level = this.level) {
    const n = this.cfg.levels.length;
    return this.multiplayer ? (((level - 1) % n) + n) % n : this.mission % n;
  }

  /** The map body of the planet being played now (and of the next one in multiplayer). */
  get bodyId() {
    if (this.testBoard) return this.cfg.testBoard.body;
    return this.cfg.levels[this.missionIndex()].body;
  }

  get nextBodyId() {
    return this.multiplayer ? this.cfg.levels[this.missionIndex(this.level + 1)].body : this.cfg.levels[(this.mission + 1) % this.cfg.levels.length].body;
  }

  /** Size and graphics of planet `level` (its mission's entry in CONFIG.levels). Every client builds the same planet from it and the seed. */
  levelLook(level) {
    const l = this.testBoard ? this.cfg.testBoard : this.cfg.levels[this.missionIndex(level)];
    return { ...l, radius: this.cfg.planet.radius * (l.radiusScale || 1), style: l.style || 'cubes' };
  }

  /** Turns the camera, sky, sun and tunnels around the planet — on screen the planet spins. */
  applySpin() {
    this.space.group.rotation.y = this.spin;
    this.sun.position.copy(this.sunBase).applyAxisAngle(Y_AXIS, this.spin);
    this.updateCamera();
  }

  update() {
    // single player paused (Space): nothing moves; the camera can still turn
    if (this.paused && this.role === 'solo') {
      this.updateCamera();
      this.updateHud();
      return;
    }
    this.frameNo++;
    LIQUID_TIME.value += 1 / 60; // (lava and water keep moving; they stand still while paused)
    if (this.role === 'guest') this.updateGuest();
    else this.updateSim();

    this.debris.update();
    this.gases.setView(this.renderer.domElement.height, this.camera.fov); // (the wisps' size on screen)
    this.marker.update();
    this.lightning.update(this.camera);
    this.zaps.update(this.camera);
    for (const p of this.activePlayers()) p.beacon.update(this.camera);
    this.updateHud();
  }

  /** Single player and host: run the simulation. */
  updateSim() {
    // the planet starts turning with the match (while waiting, swarms sit at their tunnels)
    if (this.started) this.spin += this.cfg.planet.spinSpeed;
    this.applySpin();
    const players = this.activePlayers();
    // before the start, swarms wait at their tunnels
    if (this.started) for (const p of players) p.update();
    // liquid voxels that went this frame: droplets, and no points for them (only siphons collect them)
    this.takeSpills();
    if (this.started) { this.liquids.step(this.planet); this.gases.step(this.planet); }

    const pl = this.planet;
    // the planet counts as eaten only when its last voxel is gone and nothing of it is left in space
    // (droplets of liquid, puffs of gas: siphons and scoops must take them in first); then every swarm flies home
    if (this.started && pl.alive && pl.left <= 0 && !this.liquids.count && !this.gases.count) {
      pl.shatter((idx, color) => this.debris.emit(pl.cellCenter(idx, this.tmp), color, this.cfg.debris.perCellOnFinish));
      for (const p of players) p.jumpOut(); // off to hyperspace, one after another
      this.returnFrames = 0;
      this.banner = this.planetResult();
      // multiplayer: a summary for everyone; the next planet waits until every player pressed Next planet
      if (this.multiplayer) {
        for (const p of players) p.nextReady = false;
        this.setSummary(this.buildSummary());
      }
    }
    // the next planet appears once every ship has jumped to hyperspace
    // (and, in multiplayer, everyone has closed the summary with Next planet); they arrive through the tunnel
    if (this.started && !pl.alive) {
      this.returnFrames++;
      const home = players.every((p) => p.departed()) || this.returnFrames > this.cfg.beacon.returnTimeoutFrames;
      if (home && (!this.multiplayer || players.every((p) => p.nextReady))) {
        const done = this.bodyId;
        pl.dispose();
        // the test board: the same body again at once (a new seed), the ships come out of the tunnel; nothing kept
        if (this.testBoard) {
          this.spawnPlanet();
          this.boardsEaten = (this.boardsEaten || 0) + 1;
          return;
        }
        // single player: back to the map (the next mission is ready behind it); multiplayer: the next in order
        if (!this.multiplayer) this.mission = (this.mission + 1) % this.cfg.levels.length;
        this.spawnPlanet();
        this.setSummary(null);
        this.net?.broadcastPlanet(this);
        if (!this.multiplayer) {
          this.started = false;
          this.onMissionDone?.(done);
        }
      }
    }
    // ships that began their jump to hyperspace: the guests see them go the same way
    for (const p of players) {
      if (!p.swarm.started.length) continue;
      if (this.role === 'host') this.net?.broadcastWarp(p.index, p.swarm.started);
      p.swarm.started.length = 0;
    }
    // orbs fly (following a target on a drifting piece) and burst
    if (this.started) this.orbs.update((o) => this.orbBurst(o), (o, out) => { if (this.planet.solid(o.target)) this.planet.cellCenter(o.target, out); });
    // snipers' shots fly (speeding up, following a target on a drifting piece) and hit
    if (this.started) this.shots.update((sh) => this.shotHit(sh), (sh, out) => { if (this.planet.solid(sh.target)) this.planet.cellCenter(sh.target, out); });
    // splashers' bubbles fly and land; the blocks they hit soak (and go)
    if (this.started) this.bubbles.update((bb) => this.splash(bb), (bb, out) => { if (this.planet.solid(bb.target)) this.planet.cellCenter(bb.target, out); });
    if (this.started && this.planet.alive) this.updateSoaks();
    // black holes pull in debris and pieces (and swallow them)
    if (this.started) this.holes.update(this.debris, this.planet.alive ? this.planet.fragments : null, (f, owner) => this.swallow(f, owner));
    // bitten-off pieces drift and turn; new splits are found
    this.planet.fragments?.step(this.started && this.planet.alive);
    // (more often while a piece is towed or pulled: it moves faster than a drift)
    const every = this.planet.fragments?.towing || this.holes.any ? this.cfg.fragments.towSyncEvery : this.cfg.fragments.syncEvery;
    if (this.role === 'host' && this.frameNo % every === 0) {
      this.net?.broadcastFragmentMotions(this.planet.fragments?.motions() || []);
    }
    this.planet.sync();
    if (this.role === 'host' && this.frameNo % this.cfg.net.snapshotEvery === 0) this.net?.broadcastSnapshot(this);
  }

  /** Draws a chain-lightning bolt (and, on the host, sends it to the guests). */
  showBolt(player, path) {
    this.lightning.show(path, player.color);
    if (this.role === 'host') this.net?.broadcastBolt(player.index, path);
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
    const loop = (now) => {
      if (!this.running) return;
      this.countFrame(now);
      this.update();
      for (const p of this.activePlayers()) p.swarm.render(this.camera);
      this.holes.render(this.renderer, this.scene, this.camera, this.bubbles.lenses(), (p) => this.behindPlanet(p));
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  /** Is the planet between the camera and point p (a bubble behind it isn't drawn)? */
  behindPlanet(p) {
    const pl = this.planet;
    if (!pl?.alive) return false;
    const cam = this.camera.position, R = pl.R * 0.92;
    const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z, len = Math.hypot(dx, dy, dz) || 1;
    // the closest point of the line of sight to the centre, if it lies before p
    const t = -(cam.x * dx + cam.y * dy + cam.z * dz) / len;
    if (t <= 0 || t >= len) return false;
    const cx = cam.x + (dx / len) * t, cy = cam.y + (dy / len) * t, cz = cam.z + (dz / len) * t;
    return cx * cx + cy * cy + cz * cz < R * R && Math.hypot(p.x, p.y, p.z) > R * 0.5;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }
}

for (const part of [Input, Destruction, HostSide, GuestSide, HudText, Graphics]) {
  Object.defineProperties(Game3D.prototype, Object.getOwnPropertyDescriptors(part));
}
