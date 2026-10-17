import { CONFIG } from '../../config.js';

const THREE = window.THREE;

/**
 * The spawn tunnel: ships coming out of it on a new planet, jumping to hyperspace after one, the
 * spawn point moving (multiplayer) and where it is in the world.
 * (Part of Player: these become its methods.)
 */
export const Arrival = {
  /**
   * Ships arriving through the tunnel (each planet): it opens; once it is nearly open the ships
   * come out one after another over `portal.emergeWindow` frames, heading out of it; when the
   * last one is out (and a moment later) it closes again.
   */
  updateArrival() {
    const a = this.arrival, s = this.swarm, c = CONFIG.portal, portal = this.beacon;
    if (a.phase === 'done') return;
    if (a.phase === 'pending') {
      portal.open();
      a.phase = 'opening';
      a.t = 0;
      a.delays = Array.from({ length: s.count }, () => Math.floor(Math.random() * c.emergeWindow));
      return;
    }
    if (a.phase === 'opening') {
      if (portal.openness >= 0.85) a.phase = 'emerging';
      return;
    }
    a.t++;
    const p = new THREE.Vector3(), out = portal.outward(new THREE.Vector3());
    let waiting = false;
    for (let i = 0; i < s.count; i++) {
      if (!s.hidden[i] || s.warpT[i] > 0) continue;
      if ((a.delays[i] ?? 0) > a.t) { waiting = true; continue; }
      s.hidden[i] = 0;
      portal.exitPoint(p);
      const i3 = i * 3;
      s.pos[i3] = p.x; s.pos[i3 + 1] = p.y; s.pos[i3 + 2] = p.z;
      const jx = out.x + (Math.random() - 0.5) * 0.5, jy = out.y + (Math.random() - 0.5) * 0.5, jz = out.z + (Math.random() - 0.5) * 0.5;
      const l = Math.hypot(jx, jy, jz) || 1;
      s.dir[i3] = s.look[i3] = jx / l; s.dir[i3 + 1] = s.look[i3 + 1] = jy / l; s.dir[i3 + 2] = s.look[i3 + 2] = jz / l;
    }
    if (!waiting && a.t > c.emergeWindow + c.linger) {
      portal.close();
      a.phase = 'done';
    }
  },

  /** The planet is eaten: every ship jumps to hyperspace, one after another. */
  jumpOut() {
    this.homeMode = 'jump';
    this.dropAllBites(0);
    for (const [i, t] of this.towing) this.letGo(i, t);
    this.swarm.jumpAll();
  },

  /** Every ship is gone to hyperspace (the next planet may come). */
  departed() {
    return this.swarm.allHidden;
  },

  /** Move this player's spawn (and tunnel) to a new point in the space frame. */
  setSpawn(spawn) {
    // (`spawn` is for an Earth-sized planet; a bigger one moves it out: Game3D.fitToPlanet)
    this.spawnBase = { x: spawn.x, y: spawn.y, z: spawn.z };
    const k = this.game.sizeScale || 1;
    this.spawnSpace.set(spawn.x * k, spawn.y * k, spawn.z * k);
    this.beacon.group.position.copy(this.spawnSpace);
    this.beacon.group.updateWorldMatrix(true, false);
    // before the match starts the swarm waits at its tunnel, so it moves along with it
    if (!this.game.started) this.placeAtSpawn();
  },

  /** Moves the whole swarm (and its target) to the tunnel. */
  placeAtSpawn() {
    const home = this.spawnWorld();
    const s = this.swarm;
    const c = s.count > 0 ? s.center() : home;
    const dx = home.x - c.x, dy = home.y - c.y, dz = home.z - c.z;
    for (let i = 0; i < s.count * 3; i += 3) {
      s.pos[i] += dx; s.pos[i + 1] += dy; s.pos[i + 2] += dz;
    }
    const L = this.leader;
    L.pos.x = home.x; L.pos.y = home.y; L.pos.z = home.z;
    L.vel.x = L.vel.y = L.vel.z = 0;
  },

  /** Current world position of this player's spawn tunnel (`tunnel`). */
  spawnWorld() {
    const p = this.beacon.worldPosition(new THREE.Vector3());
    return { x: p.x, y: p.y, z: p.z };
  },
};
