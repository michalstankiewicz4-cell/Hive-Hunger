/**
 * Multiplayer panel (bottom left): create a room (Co-op or PvP), share its link, see who
 * is in, leave. A guest who opened a room link sees the room they joined.
 */
export class Lobby {
  /**
   * @param {HTMLElement} root
   * @param {{onCreate:(mode:'coop'|'pvp')=>void, available:boolean}} opts
   */
  constructor(root, { onCreate, available }) {
    this.root = root;
    this.onCreate = onCreate;
    this.mode = 'coop';
    if (!available) this.showMessage('Multiplayer is unavailable: the connection library could not be loaded.', false);
    else this.showSolo();
  }

  clear(title) {
    this.root.replaceChildren();
    const h = document.createElement('div');
    h.className = 'lobby-title';
    h.textContent = title;
    this.root.appendChild(h);
  }

  button(label, onClick, extraClass = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `lobby-button ${extraClass}`.trim();
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  line(text, cls = 'lobby-line') {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    return d;
  }

  /** Single player: choose a mode and create a room. */
  showSolo() {
    this.clear('Multiplayer');
    const seg = document.createElement('div');
    seg.className = 'lobby-modes';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Game mode');
    for (const [mode, label] of [['coop', 'Co-op'], ['pvp', 'PvP']]) {
      const b = this.button(label, () => { this.mode = mode; this.showSolo(); }, 'lobby-mode');
      b.setAttribute('aria-pressed', String(this.mode === mode));
      seg.appendChild(b);
    }
    this.root.append(
      seg,
      this.line(this.mode === 'coop' ? 'Everyone eats the same planet together.' : 'Race: whoever eats more of the planet wins it.', 'lobby-note'),
      this.button('Create room', () => {
        this.clear('Multiplayer');
        this.root.appendChild(this.line('Creating room…'));
        this.onCreate(this.mode);
      }, 'is-primary'),
    );
  }

  /** Host: room is open. */
  showHost(code, mode, players) {
    const link = roomLink(code);
    this.clear(`Room ${code} · ${mode === 'pvp' ? 'PvP' : 'Co-op'}`);
    this.root.appendChild(this.line(`${players} / 4 players · you are Blue`));

    const field = document.createElement('input');
    field.type = 'text';
    field.readOnly = true;
    field.id = 'lobby-link';
    field.className = 'lobby-link';
    field.value = link;
    field.setAttribute('aria-label', 'Room link');
    const copy = this.button('Copy link', async () => {
      try {
        await navigator.clipboard.writeText(link);
        copy.textContent = 'Copied';
      } catch {
        field.select();
        copy.textContent = 'Press Ctrl+C';
      }
      setTimeout(() => (copy.textContent = 'Copy link'), 1800);
    }, 'is-primary');
    const row = document.createElement('div');
    row.className = 'lobby-row';
    row.append(field, copy);

    this.root.append(
      this.line('Send this link to the other players:', 'lobby-note'),
      row,
      this.button('Leave room', leave),
    );
  }

  showJoining(code) {
    this.clear(`Room ${code}`);
    this.root.appendChild(this.line('Joining…'));
  }

  /** Guest: joined. */
  showGuest(code, mode, name) {
    this.clear(`Room ${code} · ${mode === 'pvp' ? 'PvP' : 'Co-op'}`);
    this.root.append(this.line(`You are ${name}`), this.button('Leave room', leave));
  }

  /** An error or a closed room, with a way back to single player. */
  showMessage(text, withSolo = true) {
    this.clear('Multiplayer');
    this.root.appendChild(this.line(text, 'lobby-note'));
    if (withSolo) this.root.appendChild(this.button('Play solo', leave, 'is-primary'));
  }
}

export function roomLink(code) {
  return `${location.origin}${location.pathname}?room=${code}`;
}

/** Back to single player: the page without the room code. */
function leave() {
  location.href = `${location.origin}${location.pathname}`;
}
