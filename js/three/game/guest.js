/**
 * Multiplayer, guest side: no simulation here — the planet, pieces, swarms and effects follow what
 * the host sends (snapshots and events).
 * (Part of Game3D: these become its methods.)
 */
export const GuestSide = {
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
      if (this.started) this.holes.update(this.debris); // (pieces move as the host sends them)
      this.orbs.update();
      this.shots.update();
      this.bubbles.update((bb) => this.splash(bb));
      this.planet.fragments?.step(this.started && this.planet.alive);
      this.planet.sync();
    }
  },

  /** The host accepted us (the players and our spawn arrive in the next 'players' message). */
  onWelcome(msg) {
    this.mode = msg.mode;
    this.localIndex = msg.index;
    this.cameraAimed = false;
  },

  /**
   * Player list from the host (someone joined or left): add and remove players and move
   * the tunnels to their new, evenly spread spawns. The first time we see our own spawn,
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
        this.faceAngle(this.slotAngle(slot, list.length));
        this.cameraAimed = true;
      }
    });
    for (let i = 0; i < this.players.length; i++) if (this.players[i] && !seen.has(i)) this.removePlayer(i);
  },

  /** A planet from the host: same seed = same planet; `bits` = which voxels were eaten (run lengths). */
  onPlanet({ seed, level, bits }) {
    if (this.planet) this.planet.dispose();
    this.level = level - 1;
    this.spawnPlanet(seed);
    if (bits) this.planet.applyEatenRuns(bits);
    this.planet.sync();
    if (this.summary) this.setSummary(null);
  },

  /** A piece bitten off on the host: the same fragment here (same voxels, id and motion). */
  onFragment({ id, cells, motion }) {
    this.planet?.fragments?.create(cells, id, motion);
  },

  /** A state update from the host. */
  onSnapshot(s) {
    this.remoteSpin = s.spin;
    this.remote.left = s.left;
    this.banner = s.banner;
    for (const ps of s.players) {
      const p = this.players[ps.index];
      if (!p) continue;
      p.homeMode = ps.home === 1 ? 'recall' : ps.home === 2 ? 'jump' : null;
      p.beacon.setOpen(ps.portal);
      if (ps.hidden) for (let i = 0; i < ps.count; i++) {
        // ships not out of the tunnel yet / gone (a ship jumping away here keeps going on its own)
        if (p.swarm.warpT[i] === 0) p.swarm.hidden[i] = (ps.hidden[i >> 3] >> (i & 7)) & 1;
      }
      p.beacon.active = ps.home !== 0;
      p.score = ps.score;
      p.planetScore = ps.planetScore;
      p.wins = ps.wins;
      p.swarm.setRemote(ps.count, ps.pos, ps.dir, ps.lasers, ps.beams, ps.storms, ps.bolts, ps.tugs, ps.tows, ps.bombers, ps.orbs, ps.supports, ps.cleaners, ps.drills, ps.drilling, ps.piercers, ps.snipers, ps.splashers, ps.boosters, ps.cutters, ps.cuts, ps.siphons);
    }
    const pl = this.planet;
    if (pl && pl.alive) {
      for (const idx of s.removed) {
        if (pl.solid(idx)) {
          this.debris.emit(pl.cellCenter(idx, this.tmp), pl.colorOf(idx), this.cfg.debris.perCell);
          pl.remove(idx);
        }
      }
    }
  },

  /** Guest: ships of a player began their jump to hyperspace on the host. */
  onWarp({ index, list }) {
    const s = this.players[index]?.swarm;
    if (s) for (const [i, x, y, z] of list) if (i < s.count) s.startWarp(i, x, y, z);
  },

  /** Guest: a support ship fired on the host — the same bolt here. */
  onZap({ index, chain, seed }) {
    const p = this.players[index];
    if (p) this.zap(p, chain, seed);
  },

  /** Guest: a splasher fired on the host — the same bubble here (what it soaks away arrives in snapshots). */
  onBubble(a, b) {
    this.bubbles.fire({ x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] });
  },

  /** Guest: a sniper fired on the host — the same shot here (the voxel it destroys arrives in snapshots). */
  onShot(a, b) {
    this.shots.fire({ x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] });
  },

  /** Guest: an orb ship fired on the host — the same orb here (its burst arrives in snapshots). */
  onOrb(a, b) {
    this.orbs.fire({ x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] });
  },

  /** Guest: a bomber blew up on the host — the black hole here too. */
  onHole(p) {
    this.holes.add({ x: p[0], y: p[1], z: p[2] });
  },

  /** A guest sees a bolt the host fired. */
  onBolt({ index, p }) {
    const player = this.players[index];
    if (player) this.lightning.show(p, player.color);
  },

  /** Guest: the host changed some of our settings (our bombers blew up). */
  onSettings(values) {
    this.onSettingsChange?.(values);
  },

  /** Guest: our tree from the host after a purchase. */
  onTree(tree) {
    this.localPlayer?.tree.load(tree);
    this.onTreeChange?.();
  },
};
