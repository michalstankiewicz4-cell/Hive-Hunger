import { bodyById } from '../solar.js';

/**
 * Level switch in the settings panel (single player only): a button per mission that can be played
 * (CONFIG.levels, in the map's order). A click builds that planet right away, and the swarm starts
 * again from its tunnel — so it never ends up inside the new shape. Hidden in multiplayer.
 */

export class LevelSwitch {
  /**
   * @param {HTMLElement} root the settings panel
   * @param {Array<{body:string}>} levels CONFIG.levels
   * @param {{isSolo:()=>boolean, current:()=>number, onPick:(level:number)=>void}} opts
   *   current: the mission being played (1 = the first)
   */
  constructor(root, levels, opts) {
    this.levels = levels;
    this.opts = opts;
    this.row = document.createElement('div');
    this.row.className = 'control-levels';
    const label = document.createElement('span');
    label.textContent = 'Level';
    const buttons = document.createElement('div');
    buttons.className = 'control-levels-buttons';
    buttons.setAttribute('role', 'group');
    buttons.setAttribute('aria-label', 'Jump to level');
    this.buttons = levels.map((l, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(n + 1);
      b.title = `Level ${n + 1}: ${bodyById(l.body)?.name || l.body}`;
      b.addEventListener('click', () => {
        opts.onPick(n + 1);
        this.sync();
      });
      buttons.appendChild(b);
      return b;
    });
    this.row.append(label, buttons);
    root.appendChild(this.row);
    this.sync();
  }

  /** Shows the switch only in single player and marks the current level. */
  sync() {
    const solo = this.opts.isSolo();
    this.row.hidden = !solo;
    if (!solo) return;
    const cur = (this.opts.current() - 1) % this.levels.length;
    this.buttons.forEach((b, n) => b.setAttribute('aria-pressed', String(n === cur)));
  }
}
