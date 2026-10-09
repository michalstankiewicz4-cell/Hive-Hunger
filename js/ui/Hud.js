const MODE_LABEL = { coop: 'Co-op', pvp: 'PvP' };

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

/** Planet counter, control hints and — in multiplayer — the scoreboard (top left). */
export class Hud {
  constructor(element) {
    this.el = element;
    this.last = '';
  }

  /**
   * @param {object} s
   * @param {number} s.level planet number
   * @param {number} s.eaten 0..1
   * @param {string} [s.hint]
   * @param {'coop'|'pvp'|null} [s.mode]
   * @param {Array<{name,color,score,planetScore,wins,local}>|null} [s.scores] multiplayer only
   * @param {string} [s.banner] e.g. who won the planet
   */
  update({ level, eaten, hint = '', mode = null, scores = null, banner = '' }) {
    const title = `Planet ${level} · ${Math.floor(eaten * 100)}% eaten${mode ? ` · ${MODE_LABEL[mode]}` : ''}`;
    const key = JSON.stringify([title, hint, scores, banner]);
    if (key === this.last) return;
    this.last = key;

    this.el.replaceChildren();
    const head = document.createElement('div');
    head.textContent = title;
    this.el.appendChild(head);

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
        // PvP shows planets won and voxels eaten of this planet; co-op shows each player's share
        value.textContent = mode === 'pvp'
          ? `${s.planetScore.toLocaleString('en')} · ${s.wins} won`
          : s.score.toLocaleString('en');
        row.append(dot, name, value);
        list.appendChild(row);
      }
      this.el.appendChild(list);
    }

    if (hint) {
      const small = document.createElement('div');
      small.className = 'hud-hint';
      small.textContent = hint;
      this.el.appendChild(small);
    }
  }
}
