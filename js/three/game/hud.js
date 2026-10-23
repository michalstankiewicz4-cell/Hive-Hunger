import { bodyById } from '../../solar.js';
/**
 * The HUD: progress, the hint line, scores and pings, short notices.
 * (Part of Game3D: these become its methods.)
 */
export const HudText = {
  /** A short message in the HUD (someone joined, left, lost the connection). */
  notify(text) {
    this.notices.push({ text, until: performance.now() + this.cfg.net.noticeMs });
    if (this.notices.length > 4) this.notices.shift();
  },

  /** Connection stats of player `index` from the host (undefined until the first update). */
  statsOf(index) {
    return this.netStats.find((s) => s.index === index);
  },

  updateHud() {
    const me = this.localPlayer;
    const pl = this.planet;
    let eaten = 0;
    if (pl) eaten = !pl.alive ? 1 : 1 - pl.left / pl.total;
    // only what is happening now; the controls are described in Settings (Mouse, Keyboard)
    const hint = !me ? 'connecting…'
      : me.homeMode === 'jump'
        ? 'planet eaten — jumping to hyperspace'
        : me.anyHome()
          ? 'called back to the tunnel'
          : '';

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
    this.hud.update({ level: this.level, body: this.testBoard ? 'Test board' : bodyById(this.bodyId)?.name, eaten, hint, mode: this.mode, scores, banner: this.banner,
      points: me ? me.points : null,
      notices: this.notices.map((n) => n.text) });
  },
};
