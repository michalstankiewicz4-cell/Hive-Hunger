import { VERSION } from '../version.js';
import { el, button, linkRow, hex, pingText, MODE_NAME, roomLink, backToMenu } from './dom.js';
import { fillSettings } from './SettingsView.js';
import { fillGuide } from './ShipGuide.js';

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

  /** `splash`: over the start picture (the start screen and what opens from it) instead of the game. */
  open(title, splash = false) {
    this.root.hidden = false;
    this.root.classList.toggle('is-splash', splash);
    this.inPause = false;
    this.card.replaceChildren();
    this.card.classList.remove('is-wide', 'is-guide', 'is-start');
    this.onSettingsBack = null;
    const h = el('h2', 'menu-title', title);
    h.id = 'menu-title';
    this.card.appendChild(h);
  }

  hide() {
    this.root.hidden = true;
  }

  /** The first screen: game modes. */
  showStart() {
    this.open('Hive Hunger', true);
    this.card.classList.add('is-start');
    // the version next to the title: shows at a glance whether the page is the latest one
    this.card.querySelector('.menu-title').append(' ', el('span', 'menu-version', `v${VERSION}`));
    this.card.appendChild(el('p', 'menu-tagline', 'A swarm that eats planets.'));
    const { available, onSolo, onCreate } = this.opts;
    const choice = (label, note, onClick, disabled = false, cls = 'menu-choice') => {
      const b = button('', onClick, cls);
      b.append(el('span', 'menu-choice-label', label), el('span', 'menu-choice-note', note));
      b.disabled = disabled;
      return b;
    };
    this.card.append(
      choice('Single player', 'The solar system map: from its edge in to the Sun.', onSolo),
      choice('Multiplayer · Co-op', 'Eat the planet together (up to 4 players).', () => onCreate('coop'), !available),
      choice('Multiplayer · PvP', 'Whoever eats more of the planet wins it (up to 4 players).', () => onCreate('pvp'), !available),
      choice('Ship guide', 'Every ship type: what it does, and its shot.', () => this.showGuide(), false, 'menu-choice menu-extra menu-guide'),
      choice('Settings', 'Mouse, keyboard and graphics.', () => this.showSettings(() => this.showStart(), true), false, 'menu-choice menu-extra menu-settings'),
    );
    if (!available) this.card.appendChild(el('p', 'menu-note', 'Multiplayer is unavailable: the connection library could not be loaded.'));
    this.card.querySelector('.menu-choice')?.focus();
  }

  /**
   * Single player, Esc during a mission: the game is paused — Resume (or Esc), Save and exit, Exit to
   * main menu (without saving), Settings.
   */
  showPause() {
    this.open('Paused');
    this.inPause = true;
    const { onResume, onSaveExit, onExit } = this.opts;
    this.card.append(
      this.choice('Resume', 'Back to the game (Esc).', onResume),
      this.choice('Save and exit', 'Keep this game and go to the main menu.', onSaveExit),
      this.choice('Exit to main menu', 'Leave without saving.', onExit),
      this.choice('Settings', 'Mouse, keyboard and graphics.', () => this.showSettings(() => this.showPause()), false, 'menu-choice menu-extra menu-settings'),
    );
    this.card.querySelector('.menu-choice')?.focus();
  }

  /**
   * Single player with a saved game: continue it or start a new one (the save and the map's ticks are
   * gone then). `save`: { mission name, points, when it was saved }.
   */
  showContinue(save) {
    this.open('Single player', true);
    const when = new Date(save.at).toLocaleString();
    this.card.append(
      this.choice('Continue', `${save.mission ? `${save.mission} · ` : ''}${save.points.toLocaleString('en')} points · saved ${when}`, this.opts.onContinue),
      this.choice('New game', 'Start again from the edge of the solar system (the saved game is deleted).', this.opts.onNewGame),
      button('Back', () => this.showStart(), 'lobby-button'),
    );
    this.card.querySelector('.menu-choice')?.focus();
  }

  /** A menu choice: a label and a note under it. */
  choice(label, note, onClick, disabled = false, cls = 'menu-choice') {
    const b = button('', onClick, cls);
    b.append(el('span', 'menu-choice-label', label), el('span', 'menu-choice-note', note));
    b.disabled = disabled;
    return b;
  }

  /** The Ship guide (from the start screen); Back (or Esc) returns to it. */
  showGuide() {
    this.open('Ship guide', true);
    this.onSettingsBack = () => this.showStart(); // (Esc goes back the same way as from Settings)
    fillGuide(this.card, () => this.closeSettings());
  }

  /** Settings (mouse, keyboard, graphics); Back calls `onBack`. */
  showSettings(onBack, splash = false) {
    this.open('Settings', splash);
    this.onSettingsBack = onBack; // (the waiting room may update it meanwhile, see showRoom)
    fillSettings(this.card, () => this.closeSettings(), this.opts.saves);
  }

  /** Is the Settings screen open (Esc goes back from it)? */
  get inSettings() {
    return !this.root.hidden && Boolean(this.onSettingsBack);
  }

  /** Back from Settings to where it was opened. */
  closeSettings() {
    const back = this.onSettingsBack;
    this.onSettingsBack = null;
    back?.();
  }

  showBusy(title, text) {
    this.open(title);
    this.card.append(el('p', 'menu-note', text), button('Back to menu', backToMenu));
  }

  /**
   * The waiting room.
   * @param {{code:string, mode:string, players:Array<{index,name,color,ready,local,net}>}} room
   */
  showRoom(room) {
    // Settings open from the waiting room: stay there, Back shows the room as it is now
    if (this.inSettings) {
      this.onSettingsBack = () => this.showRoom(room);
      return;
    }
    this.open(`Room ${room.code} · ${MODE_NAME[room.mode] || ''}`);
    const me = room.players.find((p) => p.local);
    this.card.append(el('p', 'menu-note', 'Send this link to the other players:'), linkRow(roomLink(room.code)));

    const list = el('ul', 'menu-players');
    list.setAttribute('aria-label', 'Players');
    for (const p of room.players) {
      const li = el('li', 'menu-player' + (p.local ? ' is-local' : ''));
      const dot = el('span', 'hud-dot');
      dot.style.background = hex(p.color);
      const ping = el('span', 'menu-ping', pingText(p.net));
      ping.dataset.index = p.index;
      li.append(dot, el('span', '', p.local ? `${p.name} (you)` : p.name), ping,
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
      button('Settings', () => this.showSettings(() => this.showRoom(room))),
      button('Leave room', backToMenu),
    );
    if (!start.disabled) start.focus();
  }

  /** New connection stats: update the pings in the waiting room in place (keeps focus and the Copy button). */
  updatePings(statsOf) {
    for (const span of this.card.querySelectorAll('.menu-ping')) span.textContent = pingText(statsOf(Number(span.dataset.index)));
  }

  /** An error or a closed room, with the way back to the start screen. */
  showMessage(text) {
    this.open('Multiplayer');
    this.card.append(el('p', 'menu-note', text), button('Back to menu', backToMenu, 'lobby-button is-primary'));
  }
}
