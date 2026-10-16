import { PLAYERS } from './players.js';
import { bodyById } from '../../solar.js';

/**
 * Multiplayer, host side (and what single player shares with it): the summary after a planet,
 * who won it, Next planet, guests' commands and upgrade purchases.
 * (Part of Game3D: these become its methods.)
 */
export const HostSide = {
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
    // which body it was, and the next mission (they go in order)
    return { level: this.level, body: this.bodyId, next: this.nextBodyId, mode: this.mode, winner, rows };
  },

  /** Shows (or with null hides) the summary here and on the guests' screens. */
  setSummary(summary) {
    this.summary = summary;
    if (this.role === 'host' && summary) this.net?.broadcastSummary(summary);
    this.onSummaryChange?.(summary);
  },

  /** Player `index` pressed Next planet on the summary (host / via a guest's message). */
  nextPlanetReady(index) {
    const p = this.players[index];
    if (!p || !this.summary || p.nextReady) return;
    p.nextReady = true;
    this.setSummary({ ...this.summary, rows: this.summary.rows.map((r) => ({ ...r, next: Boolean(this.players[r.index]?.nextReady) })) });
  },

  /** Who won the planet (PvP) or a summary (co-op / single player). */
  planetResult() {
    const players = this.activePlayers();
    if (!this.multiplayer) return '';
    if (this.mode === 'pvp') {
      const best = players.reduce((a, b) => (b.planetScore > a.planetScore ? b : a));
      best.wins++;
      return `${best.name} wins ${bodyById(this.bodyId)?.name || `planet ${this.level}`}`;
    }
    return `${bodyById(this.bodyId)?.name || `Planet ${this.level}`} eaten together`;
  },

  /** First free player slot (1–3) or -1 when the room is full. */
  freeSlot() {
    for (let i = 1; i < PLAYERS.length; i++) if (!this.players[i]) return i;
    return -1;
  },

  /** A guest's command or setting arrived at the host. */
  onGuestMessage(index, msg) {
    const p = this.players[index];
    if (!p) return;
    if (msg.t === 'cmd' && msg.kind === 'click' && msg.p) p.command(msg.p);
    else if (msg.t === 'cmd' && msg.kind === 'recall') p.recall();
    else if (msg.t === 'set') p.setSetting(msg.key, msg.value);
    else if (msg.t === 'next') this.nextPlanetReady(index);
  },

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
  },

  /** Host: a guest wants to buy an upgrade; returns the guest's tree to send back. */
  onGuestBuy(index, id) {
    const p = this.players[index];
    if (!p) return null;
    p.buy(id);
    return p.tree.toJSON();
  },
};
