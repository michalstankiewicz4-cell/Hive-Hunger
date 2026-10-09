import { CONFIG } from '../config.js';
import { encodeSnapshot, decodeSnapshot, encodePlanet, decodePlanet, SNAPSHOT, PLANET } from './Protocol.js';

/**
 * Multiplayer over WebRTC with PeerJS. The host's browser runs the game; guests connect
 * straight to it (peer to peer). PeerJS's public server is only used to introduce the
 * browsers to each other.
 *
 * Room code → PeerJS id `${CONFIG.net.idPrefix}${code}`.
 */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L

export function randomCode(len = CONFIG.net.codeLength) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  return s;
}

export const peerId = (code) => `${CONFIG.net.idPrefix}${code}`;

/** PeerJS options; tests can point to a local signalling server via window.HIVE_PEER_OPTIONS. */
const peerOptions = () => ({ ...(window.HIVE_PEER_OPTIONS || {}) });

/** Raw PeerJS messages can arrive as string, ArrayBuffer or Blob. */
async function readData(data) {
  if (typeof data === 'string') return { json: JSON.parse(data) };
  if (data instanceof ArrayBuffer) return { bin: data };
  if (ArrayBuffer.isView(data)) return { bin: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  if (data && typeof data.arrayBuffer === 'function') return { bin: await data.arrayBuffer() };
  return {};
}

/** Host: accepts up to 3 guests, simulates their swarms and streams the game to them. */
export class NetHost {
  /**
   * @param {Game3D} game
   * @param {'coop'|'pvp'} mode
   * @param {(status:string, info?:object)=>void} onStatus 'open' {code} | 'players' {count} | 'error' {message}
   */
  constructor(game, mode, onStatus) {
    this.game = game;
    this.mode = mode;
    this.onStatus = onStatus;
    this.guests = new Map(); // conn → player index
    this.lastSeen = new Map(); // conn → time of the last message
    this.open(randomCode(), 0);
    // a guest that closed the tab without saying goodbye is dropped after a short silence
    this.watchdog = setInterval(() => {
      const now = performance.now();
      for (const [conn, t] of this.lastSeen) if (now - t > CONFIG.net.timeoutMs) this.drop(conn);
      const ping = JSON.stringify({ t: 'ping' });
      for (const conn of this.guests.keys()) conn.send(ping);
    }, CONFIG.net.pingMs);
  }

  open(code, attempt) {
    this.code = code;
    this.peer = new window.Peer(peerId(code), peerOptions());
    this.peer.on('open', () => {
      this.game.becomeHost(this.mode);
      this.game.net = this;
      this.onStatus('open', { code });
    });
    this.peer.on('connection', (conn) => this.accept(conn));
    this.peer.on('error', (err) => {
      // the code is already used by another room: try another one
      if (err.type === 'unavailable-id' && attempt < 5) {
        this.peer.destroy();
        this.open(randomCode(), attempt + 1);
        return;
      }
      this.onStatus('error', { message: describeError(err) });
    });
  }

  accept(conn) {
    conn.on('open', () => {
      const index = this.game.freeSlot();
      if (index < 0) {
        conn.send(JSON.stringify({ t: 'full' }));
        setTimeout(() => conn.close(), 500);
        return;
      }
      this.guests.set(conn, index);
      this.lastSeen.set(conn, performance.now());
      // someone joining a match that has already begun plays straight away
      this.game.addPlayer(index).ready = this.game.started;
      this.game.layoutSpawns();
      conn.send(JSON.stringify({ t: 'welcome', index, mode: this.mode, code: this.code }));
      conn.send(encodePlanet(this.game.planet, this.game.level, true));
      this.broadcastPlayers();
    });
    conn.on('data', async (data) => {
      const index = this.guests.get(conn);
      if (index === undefined) return;
      this.lastSeen.set(conn, performance.now());
      const { json } = await readData(data);
      if (json && json.t === 'bye') this.drop(conn);
      else if (json && json.t === 'ready') this.setReady(index);
      else if (json) this.game.onGuestMessage(index, json);
    });
    conn.on('close', () => this.drop(conn));
    conn.on('error', () => this.drop(conn));
  }

  /** A guest left (said goodbye, closed the connection or went silent). */
  drop(conn) {
    const index = this.guests.get(conn);
    this.lastSeen.delete(conn);
    if (index === undefined) return;
    this.guests.delete(conn);
    try { conn.close(); } catch { /* already closed */ }
    this.game.removePlayer(index);
    this.game.layoutSpawns();
    this.checkStart();
    this.broadcastPlayers();
  }

  /** A player pressed Start in the waiting room (index 0 = the host). */
  setReady(index) {
    const p = this.game.players[index];
    if (!p || p.ready) return;
    p.ready = true;
    this.checkStart();
    this.broadcastPlayers();
  }

  /** The match begins once every player in the room has pressed Start. */
  checkStart() {
    const players = this.game.activePlayers();
    if (!this.game.started && players.length > 0 && players.every((p) => p.ready)) this.game.started = true;
  }

  playerList() {
    return this.game.activePlayers().map((p) => ({
      index: p.index,
      name: p.name,
      color: p.color,
      beaconColor: p.color,
      ready: p.ready,
      spawn: { x: p.spawnSpace.x, y: p.spawnSpace.y, z: p.spawnSpace.z },
    }));
  }

  broadcastPlayers() {
    const msg = JSON.stringify({ t: 'players', list: this.playerList(), started: this.game.started });
    for (const conn of this.guests.keys()) conn.send(msg);
    this.onStatus('players');
  }

  /** A new planet appeared: guests build it from the same seed. */
  broadcastPlanet(game) {
    const buf = encodePlanet(game.planet, game.level, false);
    for (const conn of this.guests.keys()) conn.send(buf);
  }

  /** Swarm positions, scores and the voxels eaten since the last update. */
  broadcastSnapshot(game) {
    const log = game.planet.log || [];
    if (this.guests.size === 0) { log.length = 0; return; }
    // a slow connection: skip this update, eaten voxels stay queued for the next one
    for (const conn of this.guests.keys()) {
      const dc = conn.dataChannel;
      if (dc && dc.bufferedAmount > CONFIG.net.maxBuffered) return;
    }
    const buf = encodeSnapshot(game, log);
    log.length = 0;
    for (const conn of this.guests.keys()) conn.send(buf);
  }

  close() {
    clearInterval(this.watchdog);
    this.peer?.destroy();
  }
}

/** Guest: joins a room, shows what the host sends, sends clicks and settings. */
export class NetGuest {
  /**
   * @param {Game3D} game
   * @param {string} code room code
   * @param {(status:string, info?:object)=>void} onStatus 'joined' {code, index, mode} | 'error' {message} | 'closed'
   */
  constructor(game, code, onStatus) {
    this.game = game;
    this.code = code;
    this.onStatus = onStatus;
    game.net = this;
    this.peer = new window.Peer(peerOptions());
    this.peer.on('open', () => {
      this.conn = this.peer.connect(peerId(code), { reliable: true, serialization: 'raw' });
      this.conn.on('open', () => {
        this.conn.send(JSON.stringify({ t: 'hello' }));
        this.lastSeen = performance.now();
        // tell the host we're still here, and notice when the host has gone
        this.watchdog = setInterval(() => {
          if (performance.now() - this.lastSeen > CONFIG.net.timeoutMs) this.lost();
          else this.conn.send(JSON.stringify({ t: 'ping' }));
        }, CONFIG.net.pingMs);
      });
      this.conn.on('data', (data) => this.receive(data));
      this.conn.on('close', () => this.lost());
      this.conn.on('error', (err) => this.onStatus('error', { message: describeError(err) }));
    });
    this.peer.on('error', (err) => this.onStatus('error', { message: describeError(err) }));
  }

  /** The host left or the connection dropped. */
  lost() {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.watchdog);
    this.onStatus('closed');
  }

  async receive(data) {
    this.lastSeen = performance.now();
    const { json, bin } = await readData(data);
    const g = this.game;
    if (json) {
      if (json.t === 'welcome') {
        g.onWelcome(json);
        this.onStatus('joined', { code: this.code, index: json.index, mode: json.mode });
      } else if (json.t === 'players') {
        g.onPlayers(json.list, json.started);
        this.onStatus('players');
      }
      else if (json.t === 'full') this.onStatus('error', { message: 'This room is full (4 players).' });
      return;
    }
    if (!bin) return;
    const type = new DataView(bin).getUint8(0);
    if (type === PLANET) g.onPlanet(decodePlanet(bin));
    else if (type === SNAPSHOT) g.onSnapshot(decodeSnapshot(bin));
  }

  sendCommand(cmd) {
    this.conn?.open && this.conn.send(JSON.stringify({ t: 'cmd', ...cmd }));
  }

  /** We pressed Start in the waiting room. */
  sendReady() {
    this.conn?.open && this.conn.send(JSON.stringify({ t: 'ready' }));
  }

  sendSetting(key, value) {
    this.conn?.open && this.conn.send(JSON.stringify({ t: 'set', key, value }));
  }

  close() {
    clearInterval(this.watchdog);
    try { this.conn?.open && this.conn.send(JSON.stringify({ t: 'bye' })); } catch { /* closing anyway */ }
    this.peer?.destroy();
  }
}

function describeError(err) {
  switch (err && err.type) {
    case 'peer-unavailable': return 'Room not found. Check the link or ask the host for a new one.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return 'Could not reach the connection server. Check your internet connection and try again.';
    case 'browser-incompatible': return 'This browser does not support WebRTC.';
    default: return `Connection failed${err && err.type ? ` (${err.type})` : ''}.`;
  }
}
