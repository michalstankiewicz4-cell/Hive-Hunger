import { CONFIG } from './config.js';
import { VERSION } from './version.js';
import { Hud } from './ui/Hud.js';
import { ControlPanel } from './ui/ControlPanel.js';
import { Lobby } from './ui/Lobby.js';

const hudEl = document.getElementById('hud');
const lobbyEl = document.getElementById('lobby');
document.getElementById('version').textContent = `v${VERSION}`;

// a room link looks like …/Hive-Hunger/?room=ABC123
const roomCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

if (!window.THREE) {
  hudEl.textContent = 'Could not load the 3D library. Check your connection and reload the page.';
} else {
  const { Game3D, PLAYERS } = await import('./three/Game3D.js');
  const { NetHost, NetGuest } = await import('./net/Net.js');
  const canNet = Boolean(window.Peer);
  const role = roomCode && canNet ? 'guest' : 'solo';
  const game = new Game3D(document.body, new Hud(hudEl), { role });

  // the panel controls your own swarm; a guest's settings are sent to the host
  const S = CONFIG.swarm;
  const guestSettings = { count: S.count, speed: S.speed, power: S.biteRadius, spacing: S.separationDistance, cohesion: S.weights.cohesion, nearest: S.nearestMode };
  const bind = (key) => ({
    get: () => (game.role === 'guest' ? guestSettings[key] : game.localPlayer.getSetting(key)),
    set: (v) => {
      guestSettings[key] = v;
      game.setLocalSetting(key, v);
    },
  });
  new ControlPanel(document.getElementById('controls'), CONFIG.controls,
    Object.fromEntries(['count', 'speed', 'power', 'spacing', 'cohesion', 'nearest'].map((k) => [k, bind(k)])));

  const lobby = new Lobby(lobbyEl, {
    available: canNet,
    onCreate: (mode) => {
      new NetHost(game, mode, (status, info) => {
        if (status === 'open') lobby.showHost(info.code, mode, 1);
        else if (status === 'players') lobby.showHost(game.net.code, mode, info.count);
        else if (status === 'error') lobby.showMessage(info.message);
      });
    },
  });

  if (role === 'guest') {
    lobby.showJoining(roomCode);
    new NetGuest(game, roomCode, (status, info) => {
      if (status === 'joined') lobby.showGuest(info.code, info.mode, PLAYERS[info.index].name);
      else if (status === 'error') lobby.showMessage(info.message);
      else if (status === 'closed') lobby.showMessage('The host left the room.');
    });
  } else if (roomCode && !canNet) {
    lobby.showMessage('Could not join the room: the connection library did not load. Check your connection and reload.');
  }

  // leaving the page closes the room (host) or says goodbye to the host (guest)
  window.addEventListener('pagehide', () => game.net?.close());

  game.start();
}
