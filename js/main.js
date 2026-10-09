import { CONFIG } from './config.js';
import { Hud } from './ui/Hud.js';
import { ControlPanel } from './ui/ControlPanel.js';

const hudEl = document.getElementById('hud');

if (!window.THREE) {
  hudEl.textContent = 'Nie udało się wczytać biblioteki 3D. Sprawdź połączenie i odśwież stronę.';
} else {
  const { Game3D } = await import('./three/Game3D.js');
  const game = new Game3D(document.body, new Hud(hudEl));

  new ControlPanel(document.getElementById('controls'), CONFIG.controls, {
    count: { get: () => game.swarm.count, set: (v) => game.swarm.setCount(v) },
    speed: { get: () => game.swarm.speed, set: (v) => (game.swarm.speed = v) },
    power: { get: () => game.biteRadius, set: (v) => (game.biteRadius = v) },
    spacing: { get: () => game.swarm.separationDistance, set: (v) => (game.swarm.separationDistance = v) },
    cohesion: { get: () => game.swarm.cohesion, set: (v) => (game.swarm.cohesion = v) },
  });

  game.start();
}
