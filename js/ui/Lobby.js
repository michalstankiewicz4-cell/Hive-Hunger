import { el, button, linkRow, MODE_NAME, roomLink, backToMenu } from './dom.js';

/**
 * Room panel during a multiplayer match (bottom left): the room, its link for anyone who
 * still wants to join, and Leave.
 */
export class Lobby {
  /** @param {HTMLElement} root @param {()=>void} [onSettings] the Settings button */
  constructor(root, onSettings = null) {
    this.root = root;
    this.onSettings = onSettings;
    this.hide();
  }

  hide() {
    this.root.hidden = true;
  }

  /** Your connection, e.g. "Ping 42 ms · 12.5 kB/s from the host" (updated every net.pingMs). */
  updateStats(text) {
    if (this.statsLine) this.statsLine.textContent = text;
  }

  /** @param {{code:string, mode:string, players:Array<{name,local}>}} room */
  showRoom(room) {
    this.root.hidden = false;
    this.root.replaceChildren();
    const me = room.players.find((p) => p.local);
    this.root.append(
      el('div', 'lobby-title', `Room ${room.code} · ${MODE_NAME[room.mode] || ''}`),
      el('div', 'lobby-line', `${room.players.length} / 4 players${me ? ` · you are ${me.name}` : ''}`),
      (this.statsLine = el('div', 'lobby-note', '')),
      linkRow(roomLink(room.code)),
    );
    const row = el('div', 'lobby-row');
    if (this.onSettings) row.append(button('Settings', this.onSettings));
    row.append(button('Leave room', backToMenu));
    this.root.append(row);
  }
}
