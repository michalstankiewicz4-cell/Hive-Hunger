import { el, button, linkRow, MODE_NAME, roomLink, backToMenu } from './dom.js';

/**
 * Room panel during a multiplayer match (bottom left): the room, its link for anyone who
 * still wants to join, and Leave.
 */
export class Lobby {
  constructor(root) {
    this.root = root;
    this.hide();
  }

  hide() {
    this.root.hidden = true;
  }

  /** @param {{code:string, mode:string, players:Array<{name,local}>}} room */
  showRoom(room) {
    this.root.hidden = false;
    this.root.replaceChildren();
    const me = room.players.find((p) => p.local);
    this.root.append(
      el('div', 'lobby-title', `Room ${room.code} · ${MODE_NAME[room.mode] || ''}`),
      el('div', 'lobby-line', `${room.players.length} / 4 players${me ? ` · you are ${me.name}` : ''}`),
      linkRow(roomLink(room.code)),
      button('Leave room', backToMenu),
    );
  }
}
