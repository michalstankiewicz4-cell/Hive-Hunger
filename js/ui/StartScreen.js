import { el, button, linkRow, hex, MODE_NAME, roomLink, backToMenu } from './dom.js';

/**
 * Start screen over the game: choose Single player, Multiplayer Co-op or Multiplayer PvP.
 * In multiplayer it becomes the waiting room: the room link, who is in, and a Start button —
 * the match begins once every player has pressed Start.
 */
export class StartScreen {
  /**
   * @param {HTMLElement} root
   * @param {{available:boolean, onSolo:()=>void, onCreate:(mode:'coop'|'pvp')=>void, onReady:(ready:boolean)=>void}} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.card = el('div', 'menu-card');
    this.root.appendChild(this.card);
  }

  open(title) {
    this.root.hidden = false;
    this.card.replaceChildren();
    const h = el('h2', 'menu-title', title);
    h.id = 'menu-title';
    this.card.appendChild(h);
  }

  hide() {
    this.root.hidden = true;
  }

  /** The first screen: game modes. */
  showStart() {
    this.open('Hive Hunger');
    this.card.appendChild(el('p', 'menu-tagline', 'A swarm that eats planets.'));
    const { available, onSolo, onCreate } = this.opts;
    const choice = (label, note, onClick, disabled = false) => {
      const b = button('', onClick, 'menu-choice');
      b.append(el('span', 'menu-choice-label', label), el('span', 'menu-choice-note', note));
      b.disabled = disabled;
      return b;
    };
    this.card.append(
      choice('Single player', 'Your swarm, one planet after another.', onSolo),
      choice('Multiplayer · Co-op', 'Eat the planet together (up to 4 players).', () => onCreate('coop'), !available),
      choice('Multiplayer · PvP', 'Whoever eats more of the planet wins it (up to 4 players).', () => onCreate('pvp'), !available),
    );
    if (!available) this.card.appendChild(el('p', 'menu-note', 'Multiplayer is unavailable: the connection library could not be loaded.'));
    this.card.querySelector('.menu-choice')?.focus();
  }

  showBusy(title, text) {
    this.open(title);
    this.card.append(el('p', 'menu-note', text), button('Back to menu', backToMenu));
  }

  /**
   * The waiting room.
   * @param {{code:string, mode:string, players:Array<{name,color,ready,local}>}} room
   */
  showRoom(room) {
    this.open(`Room ${room.code} · ${MODE_NAME[room.mode] || ''}`);
    const me = room.players.find((p) => p.local);
    this.card.append(el('p', 'menu-note', 'Send this link to the other players:'), linkRow(roomLink(room.code)));

    const list = el('ul', 'menu-players');
    list.setAttribute('aria-label', 'Players');
    for (const p of room.players) {
      const li = el('li', 'menu-player' + (p.local ? ' is-local' : ''));
      const dot = el('span', 'hud-dot');
      dot.style.background = hex(p.color);
      li.append(dot, el('span', '', p.local ? `${p.name} (you)` : p.name),
        el('span', p.ready ? 'menu-ready' : 'menu-waiting', p.ready ? 'ready' : 'not ready'));
      list.appendChild(li);
    }
    this.card.append(el('p', 'menu-note', `${room.players.length} / 4 players`), list);

    // Start marks you ready; pressing it again ("Not ready") takes it back
    const ready = Boolean(me && me.ready);
    const start = button(ready ? 'Not ready' : 'Start', () => this.opts.onReady(!ready), ready ? 'menu-start is-ready' : 'menu-start');
    start.disabled = !me;
    this.card.append(
      start,
      el('p', 'menu-note', ready
        ? 'Waiting for the others… Press Not ready to take it back.'
        : 'The game starts when every player has pressed Start.'),
      button('Leave room', backToMenu),
    );
    if (!start.disabled) start.focus();
  }

  /** An error or a closed room, with the way back to the start screen. */
  showMessage(text) {
    this.open('Multiplayer');
    this.card.append(el('p', 'menu-note', text), button('Back to menu', backToMenu, 'lobby-button is-primary'));
  }
}
