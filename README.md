# Hive Hunger

A free 3D browser game: a swarm flies on its own, finds the nearest matter and eats a planet made of voxels — alone, or with up to four players in Co-op or PvP.

**Play:** https://michalstankiewicz4-cell.github.io/Hive-Hunger/ · **Version:** 0.7.0 ([changelog](CHANGELOG.md))

## How the swarm behaves

The swarm moves like a flock of birds (boids): units keep their distance from each other, fly the same way as their neighbours and stay with the group. Every unit flies at the same constant speed — only its direction changes.

Eating is deliberate. At matter, every unit claims its own voxel (a "bite"), flies to it, lands on it and eats it, then picks the next one. One voxel is eaten by one unit only — bites are shared only when the planet has fewer exposed voxels left than there are units. Units never eat in passing. They don't bounce off matter or pass through it; they slide along the surface. The swarm target moves on once no free voxels are left nearby.

A planet counts as eaten only when its last voxel is gone. The swarm then flies back to its spawn point (the beacon), and the next planet appears once the swarm has gathered there. The planet slowly spins.

## Controls

- **Click / tap** — send the swarm there (a pulsing ring marks the spot): every unit drops its current bite, the swarm flies over (around the planet, not through it) and starts eating at the clicked spot. A unit stuck in a corner of a crater or tunnel bites through the blocking voxel (if it isn't someone else's) and carries on
- **Click the beacon** (marker at the spawn point) — call the swarm back home; it stops eating and waits there until you click the planet again
- **Right mouse button / two fingers** — rotate the camera
- **Mouse wheel** — zoom
- **Panel in the top-right corner** — adjust your swarm live:
  - **Units** — number of units in the swarm
  - **Speed** — the shared flying speed
  - **Power** — radius of the crater a unit eats out of its bite
  - **Spacing** — distance units keep from each other
  - **Cohesion** — how strongly units stay with the group
  - **Eat nearest block** (test mechanic) — when on, every unit flies straight from the voxel it just ate to the nearest uneaten, unclaimed voxel; no free flying, only spacing between units is kept
  - **Reset to default** — restore all settings to their starting values

## Multiplayer

The start screen offers **Single player**, **Multiplayer · Co-op** and **Multiplayer · PvP**. Choosing a multiplayer mode opens a room: click **Copy link** and send it — others join by opening the link (up to 4 players). The match begins when every player in the room has pressed **Start**.

- **Co-op** — everyone eats the same planet together; the scoreboard shows each player's share.
- **PvP** — a race on the same planet: whoever eats more of it wins the planet.

Every player has their own swarm (Blue, Pink, Green, Violet), beacon and settings. Spawn points are spread evenly around the planet (2 players opposite each other, 3 a third of a turn apart, 4 a quarter). It runs peer to peer over WebRTC ([PeerJS](https://peerjs.com/)); the host's browser runs the game. Details: [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).

## Running locally

The code uses ES modules, so it has to be served over HTTP (opening `index.html` straight from disk won't work):

```bash
npx serve .
# or
python -m http.server
```

Three.js r128 (cdnjs) and PeerJS 1.5.4 (unpkg) are loaded from CDNs.

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — versions and what changed
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, the frame loop, the swarm and the planet
- [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md) — rooms, roles and the network protocol
- [CONTEXT.md](CONTEXT.md) — project context: decisions, publishing and testing, to pick the project up again

## Project structure

```
index.html            page, search metadata (title, description, keywords, link previews, structured data)
og-image.png          1200×630 thumbnail for link previews
favicon.svg, favicon-48.png, apple-touch-icon.png
sitemap.xml           sitemap for Google Search Console
.github/workflows/    GitHub Pages deployment
css/style.css
js/
  main.js               entry point: start screen, single player, hosting or joining a room
  config.js             all game, network and slider parameters
  version.js            game version
  core/Leader.js        the swarm's "brain": finds matter on its own + follows clicks
  three/Game3D.js       scene, camera, input, game loop, roles (solo / host / guest)
  three/Player.js       one player: swarm, brain, beacon, settings, score
  three/VoxelPlanet.js  voxel planet + atmosphere
  three/Swarm3D.js      the flock (boids) with collisions and feeding
  three/Debris3D.js     debris
  three/ClickMarker.js  ring marking the clicked spot
  three/SpawnBeacon.js  beacon at the spawn point (call the swarm back)
  three/Space3D.js      sky (nebulae + stars)
  net/Net.js            multiplayer host and guest over PeerJS
  net/Protocol.js       binary network messages
  ui/Hud.js             planet counter, hints, scoreboard
  ui/ControlPanel.js    sliders, toggle and reset button
  ui/StartScreen.js     start screen and multiplayer waiting room
  ui/Lobby.js           room panel during a multiplayer match
  ui/dom.js             small DOM helpers for the menus
  utils/noise.js        3D noise / fBm
  utils/terrain.js      terrain colours
  utils/space.js        nebula and star colours
docs/                 architecture and multiplayer docs
```

All tunable values (planet size, voxel size, flock weights, eating speed, network timing, slider ranges) live in `js/config.js`.

## Search & sharing

The page has a search title and description, keywords, a canonical URL, Open Graph / Twitter link previews with `og-image.png`, and `VideoGame` structured data (JSON-LD). Because the game is a 3D canvas, a short visually hidden description gives search engines text to index.

To get indexed faster, add the site in [Google Search Console](https://search.google.com/search-console) and submit `https://michalstankiewicz4-cell.github.io/Hive-Hunger/sitemap.xml`.
