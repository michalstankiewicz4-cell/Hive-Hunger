# Changelog

All notable changes to Hive Hunger. Versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`); while the game is below 1.0, a new minor version may change how things play. The current version is also in `js/version.js` and shown in the bottom-right corner of the game. Each version has a git tag (`v0.6.0`, …).

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

[0.7.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/michalstankiewicz4-cell/Hive-Hunger/releases/tag/v0.1.0
