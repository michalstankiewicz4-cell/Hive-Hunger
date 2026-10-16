import { CONFIG, SHIP_KINDS, kindConfig } from './config.js';
import { VERSION } from './version.js';
import { settings } from './settings.js';
import { Hud } from './ui/Hud.js';
import { ControlPanel } from './ui/ControlPanel.js';
import { LevelSwitch } from './ui/LevelSwitch.js';
import { ShipTypes } from './ui/ShipTypes.js';
import { Lobby } from './ui/Lobby.js';
import { StartScreen } from './ui/StartScreen.js';
import { Summary } from './ui/Summary.js';
import { TreeView } from './ui/TreeView.js';
import { SolarMap } from './ui/SolarMap.js';
import { progress } from './progress.js';
import { pingText, rateText } from './ui/dom.js';

const hudEl = document.getElementById('hud');
const lobbyEl = document.getElementById('lobby');
const menuEl = document.getElementById('menu');
const pointsEl = document.getElementById('points');
document.getElementById('version').textContent = `v${VERSION}`;

// a room link looks like …/Hive-Hunger/?room=ABC123
const roomCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

if (!window.THREE) {
  hudEl.textContent = 'Could not load the 3D library (js/vendor/three.min.js). Reload the page.';
  window.HH_LOAD?.done('game');
} else {
  const { Game3D } = await import('./three/game/Game3D.js');
  const { NetHost, NetGuest } = await import('./net/Net.js');
  const canNet = Boolean(window.Peer);
  const role = roomCode && canNet ? 'guest' : 'solo';
  const game = new Game3D(document.body, new Hud(hudEl, pointsEl), { role });

  // the panel controls your own swarm; a guest's settings are sent to the host
  const S = CONFIG.swarm;
  const guestSettings = { count: S.count, speed: S.speed, power: S.biteRadius, turn: S.turnSmoothing,
    ...Object.fromEntries(SHIP_KINDS.map((k) => [k, S[kindConfig(k)].count])) };
  const bind = (key) => ({
    get: () => (game.role === 'guest' ? guestSettings[key] : game.localPlayer.getSetting(key)),
    set: (v) => {
      guestSettings[key] = v;
      game.setLocalSetting(key, v);
    },
  });
  const panel = new ControlPanel(document.getElementById('controls'), CONFIG.controls,
    Object.fromEntries(['count', 'speed', 'power', 'turn'].map((k) => [k, bind(k)])));
  // single player: jump straight to any level (the swarm starts again from its tunnel)
  const levels = new LevelSwitch(document.getElementById('controls'), CONFIG.levels, {
    isSolo: () => game.role === 'solo',
    current: () => game.mission + 1,
    onPick: (n) => game.jumpToLevel(n),
  });
  setInterval(() => levels.sync(), 500); // hides it once a room is created; follows the planet number

  // ship types (bottom-right): yellow eaters / red laser ships / blue storm ships / green tugs / purple bombers / magenta orb ships / white support ships / grey cleaners, together all your units
  const ships = new ShipTypes(document.getElementById('ships'), {
    total: () => game.localPlayer?.swarm.count ?? guestSettings.count,
    get: (key) => bind(key).get(),
    set: (key, v) => bind(key).set(v),
  });
  setInterval(() => { ships.sync(); panel.sync(); }, 300); // follows the Units slider, upgrades, bombers lost
  // guest: the host lowered our Units / Bombers (bombers blew up)
  game.onSettingsChange = (values) => Object.assign(guestSettings, values);

  // start screen → (single player) the solar system map → a mission; (multiplayer) waiting room → match.
  // The room panel stays during the match
  let soloPlayed = false; // a single-player mission is under way (Esc can return to it)
  const playable = (id) => CONFIG.levels.some((l) => l.body === id);
  const map = new SolarMap(document.getElementById('map'), {
    playable,
    onStart: (id) => {
      if (!game.startMission(id)) return;
      soloPlayed = true;
      map.hide();
      menu.hide();
    },
    onBack: () => {
      map.hide();
      menu.showStart();
    },
  });
  // single player: the next mission is the first one not eaten yet (all of them are open for now)
  const firstUndone = () => CONFIG.levels.map((l) => l.body).find((id) => !progress.done.has(id)) || CONFIG.levels[0].body;
  const showSoloMap = (next = firstUndone()) => {
    menu.hide();
    map.show({ mode: 'solo', next, current: null, done: progress.done });
  };
  // a mission's planet is eaten and the ships are gone: back to the map, the next one marked
  game.onMissionDone = (id) => {
    progress.complete(id);
    soloPlayed = false;
    showSoloMap(game.bodyId);
  };
  // multiplayer: the map stays behind the waiting room and the summary (where the room goes next);
  // the missions go in order, so it has no Start
  const roomDone = new Set();
  let multiMapKey = '';
  setInterval(() => {
    if (game.role === 'solo') return;
    if (game.summary) roomDone.add(game.summary.body);
    const want = Boolean(game.localPlayer && (game.summary || !game.started));
    const key = want ? `${game.summary ? game.summary.next : game.bodyId}/${game.summary ? 's' : 'w'}/${roomDone.size}` : '';
    if (key === multiMapKey) return;
    multiMapKey = key;
    if (!want) map.hide();
    else map.show({ mode: 'multi', next: game.summary ? game.summary.next : game.bodyId, current: game.summary ? game.summary.body : null, done: roomDone });
  }, 300);
  // the room panel's Settings button: Settings over the game (it keeps running), Back closes it
  const lobby = new Lobby(lobbyEl, () => menu.showSettings(() => menu.hide()));
  const menu = new StartScreen(menuEl, {
    available: canNet,
    // Single player: the map (or, with a mission under way, back to it — Esc does the same)
    onSolo: () => {
      if (soloPlayed) {
        game.started = true;
        menu.hide();
      } else showSoloMap();
    },
    onCreate: (mode) => {
      menu.showBusy('Multiplayer', 'Creating room…');
      new NetHost(game, mode, (status, info) => {
        if (status === 'error') menu.showMessage(info.message);
        else if (status === 'stats') showStats();
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

  // multiplayer: summary after each planet; Next planet closes it on everyone's screen once all pressed it
  const summary = new Summary(document.getElementById('summary'), {
    onNext: () => {
      if (game.role === 'host') game.nextPlanetReady(game.localIndex);
      else if (game.summary) {
        game.net.sendNext();
        // show our own press right away; the host's update confirms it
        game.setSummary({ ...game.summary, rows: game.summary.rows.map((r) => (r.index === game.localIndex ? { ...r, next: true } : r)) });
      }
    },
  });
  game.onSummaryChange = (s) => (s ? summary.show(s, game.localIndex) : summary.hide());

  // upgrade tree: Tab or a click on the points counter; points = voxels eaten − points spent
  const tree = new TreeView(document.getElementById('tree'), {
    getTree: () => game.localPlayer?.tree || null,
    getPoints: () => game.localPlayer?.points ?? 0,
    onBuy: (id) => game.buyUpgrade(id),
  });
  pointsEl.addEventListener('click', () => tree.toggle());
  // Tab: upgrade tree. Esc: closes the tree; in single player it opens the start screen
  // (the game pauses) and closes it again (the game carries on)
  // single player: "Press Space to pause" at the bottom (and "Paused" while it is)
  const pauseHint = document.getElementById('pause-hint');
  const showPauseHint = () => {
    pauseHint.hidden = !(game.role === 'solo' && game.started && menuEl.hidden);
    pauseHint.classList.toggle('is-paused', game.paused);
    pauseHint.textContent = game.paused ? 'Paused · press Space to continue' : 'Press Space to pause';
  };
  setInterval(showPauseHint, 300);

  // FPS counter (Settings → Graphics), bottom right next to the version
  const fpsEl = document.getElementById('fps');
  setInterval(() => {
    fpsEl.hidden = !settings.get('fps');
    if (!fpsEl.hidden) fpsEl.textContent = `${game.fps} FPS`;
  }, 250);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && game.started && menuEl.hidden) {
      e.preventDefault();
      tree.toggle();
    } else if (e.code === 'Space' && game.role === 'solo' && game.started && menuEl.hidden && !tree.isOpen) {
      // single player: Space pauses and carries on (the picture stays; the camera still turns)
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      e.preventDefault();
      game.paused = !game.paused;
      showPauseHint();
    } else if (e.key === 'Escape') {
      if (tree.isOpen) tree.close();
      else if (game.role === 'solo' && !map.root.hidden) {
        map.hide(); // the map → the start screen
        menu.showStart();
      } else if (menu.inSettings) menu.closeSettings(); // back to where Settings was opened
      else if (game.role === 'solo' && game.started) {
        game.started = false;
        menu.showStart();
      } else if (game.role === 'solo' && soloPlayed && !menuEl.hidden) {
        game.started = true;
        menu.hide();
      }
    }
  });

  /** Who is in the room, for the waiting room and the room panel. */
  const roomState = () => ({
    code: game.net.code,
    mode: game.mode,
    players: game.activePlayers().map((p) => ({
      index: p.index, name: p.name, color: p.color, ready: p.ready, local: p.index === game.localIndex, net: game.statsOf(p.index),
    })),
  });
  const showRoom = () => {
    if (!game.net || !game.localPlayer) return;
    if (game.started) {
      if (!menu.inSettings) menu.hide(); // (Settings opened from the room panel stays open)
      lobby.showRoom(roomState());
      showStats();
    } else menu.showRoom(roomState());
  };

  /** Connection stats arrived (every net.pingMs): pings in the waiting room, your link in the room panel. */
  const showStats = () => {
    if (!game.net || !game.localPlayer) return;
    if (!game.started) {
      menu.updatePings((i) => game.statsOf(i));
      return;
    }
    if (game.role === 'host') {
      const guests = game.netStats.filter((s) => !s.host);
      const rate = guests.reduce((sum, s) => sum + (s.rate || 0), 0);
      lobby.updateStats(guests.length ? `Hosting · sending ${rateText(rate)} to ${guests.length} player${guests.length > 1 ? 's' : ''}` : 'Hosting · waiting for players');
    } else {
      const me = game.statsOf(game.localIndex);
      lobby.updateStats(`Ping ${pingText(me)} · ${rateText(me?.rate || 0)} from the host`);
    }
  };

  if (role === 'guest') {
    menu.showBusy(`Room ${roomCode}`, 'Joining…');
    new NetGuest(game, roomCode, (status, info) => {
      if (status === 'error') menu.showMessage(info.message);
      else if (status === 'closed') {
        lobby.hide();
        summary.hide();
        menu.showMessage(info.reason === 'left' ? 'The host left the room.' : 'Lost the connection to the host.');
      } else if (status === 'stats') showStats();
      else showRoom();
    });
  } else if (roomCode && !canNet) {
    menu.showMessage('Could not join the room: the connection library did not load. Check your connection and reload.');
  } else menu.showStart();

  // leaving the page closes the room (host) or says goodbye to the host (guest)
  window.addEventListener('pagehide', () => game.net?.close());

  game.start();
  window.HH_LOAD?.done('game'); // (the loader goes once the start picture is in too)
}
