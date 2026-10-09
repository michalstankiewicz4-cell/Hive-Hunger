import { CONFIG } from './config.js';
import { VERSION } from './version.js';
import { Hud } from './ui/Hud.js';
import { ControlPanel } from './ui/ControlPanel.js';
import { Lobby } from './ui/Lobby.js';
import { StartScreen } from './ui/StartScreen.js';

const hudEl = document.getElementById('hud');
const lobbyEl = document.getElementById('lobby');
const menuEl = document.getElementById('menu');
const menuButton = document.getElementById('menu-button');
document.getElementById('version').textContent = `v${VERSION}`;

// a room link looks like …/Hive-Hunger/?room=ABC123
const roomCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

if (!window.THREE) {
  hudEl.textContent = 'Could not load the 3D library. Check your connection and reload the page.';
} else {
  const { Game3D } = await import('./three/Game3D.js');
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

  // start screen → (multiplayer) waiting room → match; the room panel stays during the match
  const lobby = new Lobby(lobbyEl);
  const menu = new StartScreen(menuEl, {
    available: canNet,
    onSolo: () => {
      game.started = true;
      menu.hide();
      menuButton.hidden = false;
    },
    onCreate: (mode) => {
      menuButton.hidden = true;
      menu.showBusy('Multiplayer', 'Creating room…');
      new NetHost(game, mode, (status, info) => {
        if (status === 'error') menu.showMessage(info.message);
        else showRoom();
      });
    },
    // Start / Not ready in the waiting room
    onReady: (ready) => {
      if (game.role === 'host') game.net.setReady(0, ready);
      else if (game.localPlayer) {
        game.localPlayer.ready = ready;
        game.net.sendReady(ready);
        showRoom();
      }
    },
  });

  // single player: "Menu" pauses the game and goes back to the start screen
  menuButton.addEventListener('click', () => {
    game.started = false;
    menuButton.hidden = true;
    menu.showStart();
  });

  /** Who is in the room, for the waiting room and the room panel. */
  const roomState = () => ({
    code: game.net.code,
    mode: game.mode,
    players: game.activePlayers().map((p) => ({ name: p.name, color: p.color, ready: p.ready, local: p.index === game.localIndex })),
  });
  const showRoom = () => {
    if (!game.net || !game.localPlayer) return;
    if (game.started) {
      menu.hide();
      lobby.showRoom(roomState());
    } else menu.showRoom(roomState());
  };

  if (role === 'guest') {
    menu.showBusy(`Room ${roomCode}`, 'Joining…');
    new NetGuest(game, roomCode, (status, info) => {
      if (status === 'error') menu.showMessage(info.message);
      else if (status === 'closed') {
        lobby.hide();
        menu.showMessage('The host left the room.');
      } else showRoom();
    });
  } else if (roomCode && !canNet) {
    menu.showMessage('Could not join the room: the connection library did not load. Check your connection and reload.');
  } else menu.showStart();

  // leaving the page closes the room (host) or says goodbye to the host (guest)
  window.addEventListener('pagehide', () => game.net?.close());

  game.start();
}
