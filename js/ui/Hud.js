const MODE_LABEL = { coop: 'Co-op', pvp: 'PvP' };

import { hex, pingText } from './dom.js';

/** Planet counter, control hints and — in multiplayer — the scoreboard (top left). */
export class Hud {
  /**
   * @param {HTMLElement} element top-left HUD
   * @param {HTMLElement} [pointsEl] points counter (top centre)
   */
  constructor(element, pointsEl) {
    this.el = element;
    this.pointsEl = pointsEl;
    this.pointsValue = pointsEl?.querySelector('.points-value');
    this.lastPoints = null;
    this.last = '';
  }

  /**
   * @param {object} s
   * @param {number} s.level planet number
   * @param {string} [s.body] the map body's name (shown instead of the number)
   * @param {number} s.eaten 0..1
   * @param {string} [s.hint]
   * @param {'coop'|'pvp'|null} [s.mode]
   * @param {Array<{name,color,score,planetScore,wins,local,net}>|null} [s.scores] multiplayer only
   * @param {string} [s.banner] e.g. who won the planet
   * @param {string[]} [s.notices] e.g. who left or lost the connection
   * @param {number|null} [s.points] your points to spend (1 voxel = 1 point)
   * @param {Array<{name,color,n}>} [s.collected] what was collected of this planet, by kind of voxel
   */
  update({ level, body = '', eaten, hint = '', mode = null, scores = null, banner = '', notices = [], points = null, collected = [] }) {
    if (this.pointsValue && points !== this.lastPoints) {
      this.lastPoints = points;
      this.pointsEl.hidden = points === null;
      this.pointsValue.textContent = (points ?? 0).toLocaleString('en');
    }
    const title = `${body || `Planet ${level}`} · ${Math.floor(eaten * 100)}% eaten${mode ? ` · ${MODE_LABEL[mode]}` : ''}`;
    const key = JSON.stringify([title, hint, scores, banner, notices, collected]);
    if (key === this.last) return;
    this.last = key;

    this.el.replaceChildren();
    const head = document.createElement('div');
    head.textContent = title;
    this.el.appendChild(head);

    // what was collected of this planet, by kind of voxel
    if (collected.length) {
      const row = document.createElement('div');
      row.className = 'hud-collected';
      for (const c of collected) {
        const item = document.createElement('span');
        item.className = 'hud-kind';
        item.dataset.kind = c.id;
        const dot = document.createElement('span');
        dot.className = 'hud-dot';
        dot.style.background = c.color;
        item.append(dot, document.createTextNode(`${c.name} ${c.n.toLocaleString('en')}`));
        row.appendChild(item);
      }
      this.el.appendChild(row);
    }

    if (banner) {
      const b = document.createElement('div');
      b.className = 'hud-banner';
      b.textContent = banner;
      this.el.appendChild(b);
    }

    if (scores) {
      const list = document.createElement('div');
      list.className = 'hud-scores';
      for (const s of scores) {
        const row = document.createElement('div');
        row.className = 'hud-score' + (s.local ? ' is-local' : '');
        const dot = document.createElement('span');
        dot.className = 'hud-dot';
        dot.style.background = hex(s.color);
        const name = document.createElement('span');
        name.textContent = s.local ? `${s.name} (you)` : s.name;
        const value = document.createElement('span');
        value.className = 'hud-score-value';
        // PvP shows planets won and voxels eaten of this planet; co-op shows each player's total
        value.textContent = mode === 'pvp'
          ? `${s.planetScore.toLocaleString('en')} · ${s.wins} won`
          : s.score.toLocaleString('en');
        const ping = document.createElement('span');
        ping.className = 'hud-ping';
        ping.textContent = pingText(s.net);
        row.append(dot, name, value, ping);
        list.appendChild(row);
      }
      this.el.appendChild(list);
    }

    for (const text of notices) {
      const n = document.createElement('div');
      n.className = 'hud-notice';
      n.textContent = text;
      this.el.appendChild(n);
    }

    if (hint) {
      const small = document.createElement('div');
      small.className = 'hud-hint';
      small.textContent = hint;
      this.el.appendChild(small);
    }
  }
}
