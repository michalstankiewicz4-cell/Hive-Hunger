# Changelog

All notable changes to Hive Hunger. Versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`); while the game is below 1.0, a new minor version may change how things play. The current version is also in `js/version.js` and shown in the bottom-right corner of the game. Each version has a git tag (`v0.6.0`, …).

## [0.11.1] — 2026-10-09

### Added
- **Atmosphere** switch in the settings panel (top right): turns the glow around the planet off or on. Graphics only, on your screen; stays as set for the next planets; "Reset to default" turns it back on.

## [0.11.0] — 2026-10-09

### Added
- **Points** counter at the top: 1 eaten voxel = 1 point (click it or press Tab to open the tree).
- **Upgrade tree** (Tab), drawn as pixel art, growing upwards from the Hive core: **Brood** (+10 units each), **Wings** (+10% speed each), **Jaws** (+0.2 bite radius each) and **Chain lightning** with its own branches **Arcs** (+2 jumps), **Voltage** (+15% strength drained) and **Capacitor** (1 s more often). Upgrades are added on top of the settings panel; points and upgrades last until the page is reloaded. In multiplayer every player has their own points and tree (bought through the host).
- **Chain lightning**: every few seconds a bolt jumps from a random drone to the nearest drones it hasn't hit and weakens every voxel it passes through (never destroying it by itself). Guests see the bolts.
- **Destruction animation**: a voxel being eaten or weakened shrinks, darkens and shakes as its strength runs out, then breaks into debris (ready for harder voxels later).
- `tests/test_tree.py`.

## [0.10.0] — 2026-10-09

### Added
- Level 5: a **cube** with the edge of planet 1's diameter (33.6 — the small sphere would just fit inside), with terrain on its faces.
- Level 6: the text **TEST LVL** made of voxels, every letter in its own colour.
- `js/three/shapes.js` — shapes of a level (`sphere`, `cube`, `text`); new shapes are added there and used as `shape` in `CONFIG.levels`. The cycle now has six levels.

### Changed
- Only spheres get the atmosphere glow and the smoothed day/night shading; the cube and the text keep flat faces.
- Small fix: the planet grid is centred exactly on the origin (planet 1 was off by 0.2).

## [0.9.0] — 2026-10-09

### Added
- **Planet levels** in a cycle of four (then it starts again): planet 1 — a smaller planet (radius 30% smaller), planet 2 — the usual planet, planet 3 — a **smooth surface** (steps become slopes, corners round off), planet 4 — **wedges**: cubes with low-poly ramps and inner/outer corner pieces in the steps. Levels 3 and 4 change only the graphics; the swarm still collides with and eats the voxels.
- `CONFIG.levels` (size and look of each level) and `js/three/PlanetSurface.js` (the surfaces, rebuilt in chunks as voxels are eaten); new looks can be tried out as new levels.
- `tests/test_levels.py`.

## [0.8.0] — 2026-10-09

### Added
- Multiplayer **summary** after each planet: voxels each player ate of it, their share, totals, planets won and the PvP winner. It closes with **Next planet**; the next planet appears once every player has pressed it and the swarms are home.
- Multiplayer connection stats: every player's **ping** next to their name in the scoreboard and in the waiting room; the room panel shows your connection (a guest's ping and data from the host, the host's upload).
- Notices in the HUD: "… joined", "… left the room" (they said goodbye) and "…: connection lost" (dropped or silent for 10 s). Guests see "The host left the room" or "Lost the connection to the host".
- Browser tests in `tests/` (single player and multiplayer with a local PeerJS server).
- MIT licence; `docs/CONFIG.md` (what every setting does); troubleshooting in the README; game-state diagram in `docs/ARCHITECTURE.md`; publishing steps and known pitfalls in `CONTEXT.md`.

### Changed
- The single-player hint in the HUD mentions the **Menu** button.

## [0.7.1] — 2026-10-09

### Added
- **Menu** button in single player (bottom left): pauses the game and goes back to the start screen without reloading; **Single player** carries on with the same game.
- In the waiting room, **Not ready** takes back a pressed Start.

## [0.7.0] — 2026-10-09

### Added
- Start screen: **Single player**, **Multiplayer · Co-op** or **Multiplayer · PvP**.
- Multiplayer waiting room: the room link, the players and who is ready. The match begins only when every player in the room has pressed **Start**; until then the swarms wait at their beacons and the planet stands still. Someone who joins a match that has already begun plays straight away.

### Changed
- Players' spawn points are spread evenly around the planet: 2 players opposite each other, 3 a third of a turn apart, 4 a quarter. When someone joins or leaves, the spawns are spread again.
- During a match the room panel (bottom left) shows the room, its link and Leave; leaving returns to the start screen.

## [0.6.0] — 2026-10-09

### Added
- **Multiplayer over WebRTC** (PeerJS), up to 4 players. The host creates a room — **Co-op** (eat the planet together) or **PvP** (whoever eats more of the planet wins it) — and shares a link (`?room=CODE`). Single player stays the default.
- Every player has their own swarm, colour (Blue, Pink, Green, Violet), beacon and settings panel; all swarms share the planet's voxel claims, so a voxel is still eaten by one unit only.
- Scoreboard in the HUD: voxels eaten per player; in PvP also planets won and a "… wins planet N" banner.
- Multiplayer panel (bottom left): mode, create room, copy link, leave.
- Version number in the corner of the game, `CHANGELOG.md`, `CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/MULTIPLAYER.md`.

### Changed
- The game is split into `Player` (one swarm with its brain, beacon, settings and score) and `Game3D` (planet, camera, roles: solo / host / guest).
- The planet takes a seed, so every browser can build the same planet.

## [0.5.1] — 2026-10-09

### Changed
- Units turn smoothly on screen: the drawn heading follows the flying direction gradually (`swarm.turnSmoothing`); movement and collisions are unchanged.

## [0.5.0] — 2026-10-09

### Added
- The planet slowly spins (the camera, sky, sun and beacon turn around it).
- Amber beacon at the spawn point: clicking it calls the swarm back home.
- "Reset to default" button in the settings panel.

### Changed
- A planet counts as eaten only when its last voxel is gone (it used to shatter at 97%). The swarm then flies home and the next planet appears once it has gathered.
- Units land on a bite once within reach, so isolated scraps at the end are eaten instead of being circled forever.

## [0.4.0] — 2026-10-09

### Added
- "Eat nearest block" mechanic (checkbox): after eating, each unit flies straight to the nearest uneaten, unclaimed voxel.
- Pulsing ring marker where the player clicked.

### Changed
- Clicks send the whole swarm to the clicked spot; units fly around the planet instead of into it and climb out of their pits first.
- Stuck units bite through the blocking voxel (if it is not someone else's) or turn to slide out.
- The swarm spawns about one planet radius away from the surface, on screen.
- Default settings: 20 units, speed 0.05, power 0.5, spacing 1.5, cohesion 1, "Eat nearest block" on.

## [0.3.0] — 2026-10-09

### Added
- Search engine optimisation: title, description, keywords (including "incremental free"), canonical URL, Open Graph / Twitter link previews with a thumbnail, `VideoGame` structured data, favicons, sitemap.

## [0.2.0] — 2026-10-09

### Changed
- Everything in English: UI, code comments, configuration and documentation.

## [0.1.0] — 2026-10-09

### Added
- First release on GitHub Pages: a 3D swarm (boids, constant speed) that eats a voxel planet; deliberate feeding with one claimed voxel per unit; live sliders for units, speed, power, spacing and cohesion; space background with nebulae and stars; GitHub Pages deployment workflow.

[0.11.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.7.1...v0.8.0
[0.7.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/releases/tag/v0.1.0
