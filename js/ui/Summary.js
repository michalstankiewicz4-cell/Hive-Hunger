import { el, button, hex } from './dom.js';

/**
 * Multiplayer summary after a planet is eaten: who ate how much of it, the totals, the PvP
 * winner. It closes with Next planet; the next planet appears once every player has pressed
 * it (and the swarms are home).
 */
export class Summary {
  /**
   * @param {HTMLElement} root
   * @param {{onNext:()=>void}} opts
   */
  constructor(root, { onNext }) {
    this.root = root;
    this.onNext = onNext;
    this.card = el('div', 'menu-card summary-card');
    this.root.appendChild(this.card);
    this.hide();
  }

  hide() {
    this.root.hidden = true;
  }

  /**
   * @param {{level:number, mode:'coop'|'pvp', winner:number|null,
   *   rows:Array<{index,name,color,planet,share,score,wins,next}>}} s
   * @param {number} localIndex
   */
  show(s, localIndex) {
    this.root.hidden = false;
    this.card.replaceChildren();
    const pvp = s.mode === 'pvp';
    const title = el('h2', 'menu-title', `Planet ${s.level} eaten`);
    title.id = 'summary-title';
    this.card.appendChild(title);

    const win = s.rows.find((r) => r.index === s.winner);
    const head = el('p', 'summary-result');
    if (pvp && win) {
      head.textContent = win.index === localIndex ? 'You win this planet!' : `${win.name} wins this planet`;
      head.style.color = hex(win.color);
    } else head.textContent = 'Eaten together';
    this.card.appendChild(head);

    const table = el('table', 'summary-table');
    const cols = ['Player', 'This planet', 'Share', 'Total', ...(pvp ? ['Won'] : []), 'Next'];
    const thead = el('tr');
    for (const c of cols) thead.appendChild(el('th', '', c));
    table.appendChild(thead);
    for (const r of s.rows) {
      const tr = el('tr', r.index === localIndex ? 'is-local' : '');
      const name = el('td', 'summary-name');
      const dot = el('span', 'hud-dot');
      dot.style.background = hex(r.color);
      name.append(dot, document.createTextNode(r.index === localIndex ? ` ${r.name} (you)` : ` ${r.name}`));
      tr.append(name,
        el('td', 'summary-num', r.planet.toLocaleString('en')),
        el('td', 'summary-num', `${r.share}%`),
        el('td', 'summary-num', r.score.toLocaleString('en')));
      if (pvp) tr.appendChild(el('td', 'summary-num', String(r.wins) + (r.index === s.winner ? ' ★' : '')));
      tr.appendChild(el('td', r.next ? 'summary-next' : 'summary-wait', r.next ? 'ready' : '…'));
      table.appendChild(tr);
    }
    this.card.appendChild(table);

    const me = s.rows.find((r) => r.index === localIndex);
    const pressed = !me || me.next;
    const next = button(pressed ? 'Waiting for the others…' : 'Next planet', () => this.onNext(), 'menu-start');
    next.disabled = pressed;
    this.card.append(next, el('p', 'menu-note', 'The next planet appears when every player has pressed Next planet and the swarms are home.'));
    if (!pressed) next.focus();
  }
}
