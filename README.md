# Hive Hunger

A free 3D browser game: a swarm flies on its own, finds the nearest matter and eats a planet made of voxels — alone, or with up to four players in Co-op or PvP.

**Play:** https://michalstankiewicz4-cell.github.io/Hive-Hunger/ · **Version:** 0.28.0 ([changelog](CHANGELOG.md))

## How the swarm behaves

The swarm moves like a flock of birds (boids): units keep their distance from each other, fly the same way as their neighbours and stay with the group. Every unit flies at the same constant speed — only its direction changes.

Eating is deliberate. Every unit claims the nearest uneaten, unclaimed voxel to itself (a "bite"), flies straight to it, lands on it and eats it, then picks the next nearest one — no free flying while eating, only a little spacing between units. One voxel is eaten by one unit only — bites are shared only when the planet has fewer exposed voxels left than there are units. Units never eat in passing. They don't bounce off matter or pass through it; they slide along the surface. The swarm target moves on once no free voxels are left nearby.

Planets come in a cycle of levels: 1 — a test board with every box shape from 1×1×1 to 4×4×4 voxels once (20 boxes, 5 voxels apart), 2 — the usual planet, 3 — a cube, 4 — the text TEST LVL in coloured letters, 5 — a test board with a sphere and a cube side by side (10 voxels apart); then it starts again. Every planet is drawn as a smooth surface: no steps — slopes, rounded corners and craters. It is graphics only: underneath, the swarm still eats voxels — every voxel is still 1 point.

When eating cuts a piece off — a part no longer connected to the rest — it comes loose: every part smaller than the rest gently drifts away and turns (parts of equal size all stay). It stops at most 4 units from where it came off, and big pieces turn slowly. A piece bitten through breaks up again the same way, and so on until it is eaten. The swarm can chase it and eat it like any other voxel, for the same points; a drone that hasn't eaten anything for 10 s stops for half a second and takes another bite (or the same one, if there is no other). A planet counts as eaten only when its last voxel is gone, drifting pieces included. The ships then escape into hyperspace — one after another at random moments (several at once in a big swarm), each speeding off with a blue streak behind it — and the next planet appears once they are all gone. Ships arrive through a subspace tunnel at the spawn point: it opens into a wide blue vortex, the ships fly out of it, and it closes to a small swirl (click it to call the swarm back; it opens for a moment to take in a piece a tug brings home). The planet slowly spins.

## Points and upgrades

Every eaten voxel is 1 point (counter at the top). **Tab** (or a click on the counter) opens the upgrade tree: Brood (+units), Wings (+speed), Jaws (+bite radius) and Chain lightning — a bolt that jumps between your drones every few seconds and weakens the voxels on its way — with upgrades for more jumps, stronger and more frequent bolts. Upgrades add to the settings panel. Voxels show damage as they are eaten: the surface sinks in and darkens before the voxel breaks apart.

## Controls

- **Click / tap** — send the swarm there (a pulsing ring marks the spot): every unit drops its current bite, the swarm flies over (around the planet, not through it) and starts eating at the clicked spot. A unit stuck in a corner of a crater or tunnel bites through the blocking voxel (if it isn't someone else's) and carries on
- **Click the tunnel** (the small blue vortex at the spawn point) — call the swarm back home; it stops eating and waits there until you click the planet again
- **Right mouse button / two fingers** — turn the camera, any way round (it can go over the poles)
- **Mouse wheel** — zoom
- **Tab** (or a click on the points counter) — upgrade tree (Esc closes it)
- **Space** — single player: pause (nothing moves, the camera still turns; "Paused" at the bottom), Space again carries on
- **Esc** — single player: pause and open the start screen; Esc again (or **Single player**) carries on with the same game. Also closes the upgrade tree
- **Settings** (start screen, waiting room, or the room panel during a match) — **Mouse** (what it does, camera turning and zoom speed), **Keyboard** (the keys) and **Graphics** (FPS counter, render resolution 50 / 75 / 100% / native, smooth edges, amount of effects Low / Medium / High). They apply at once and are remembered in your browser; **Reset settings** restores them. The game screen itself shows no description of the controls — they are listed here.
- **Panel in the top-right corner** — adjust your swarm live:
  - **Units** — number of units in the swarm (10–100; upgrades can't take it past 100)
  - **Speed** — the shared flying speed
  - **Power** — radius of the crater a unit eats out of its bite
  - **Turning** — how fast ships turn their nose; a ship eats only once it faces its bite
  - **Reset to default** — restore all settings to their starting values
  - **Level 1–5** (single player) — jump straight to that level; the swarm comes out of its tunnel again
- **Ship types panel in the bottom-right corner** — how many of your units are yellow **Eaters**, red **Lasers**, blue **Storms**, green **Tugs**, purple **Bombers**, magenta **Orbs**, white **Support** ships, grey **Cleaners** and orange **Drills** — a slider each (linked: together they are all your units; at the start 2 of each type — 18 units). The arrows on both sides of a slider move it by one ship. The checkbox in front of a slider locks it: it can't be moved, and moving the others never changes it. Every ship eats only once it faces its bite.
  - **Laser** ships eat their bite from 5 voxels away with a glowing red beam, but fly 10% slower.
  - **Storm** ships fire lightning from the same distance: it forks at 70% of the way into three — the bite gets 40% of a laser's damage, the two nearest voxels 30% each. When the bite is gone, the ship picks its next one like any other.
  - **Tugs** don't eat: they fly only to drifting pieces. From 10 voxels away a green tractor beam takes in the whole piece and the tug tows it home to your tunnel. There the piece is gone and you get **5 ×** the points of what is left of it — other ships (yours or other players') may eat it on the way.
  - **Bombers** fly to the nearest voxel and, touching it, blow up everything within 10 voxels (a point each) — and are gone for good (one unit fewer). The blast leaves a black hole for about 4 seconds that bends the picture around it and gently pulls in debris and drifting pieces within 15 voxels; what falls in is gone (the pieces' voxels count for the bomber's owner).
  - **Orb** ships fire, from 10 voxels away, a voxel-sized plasma orb with a pulsing glow and a fiery tail — one at a time. It flies slowly to the bite and bursts there: everything within 2 voxels is gone (a point each).
  - **Support** ships don't eat: every 3 seconds each fires a white lightning bolt at your own ships — it jumps between them in a random order (up to 6 jumps) over 1.5 s and is gone after the last one; every voxel on its way is destroyed (a point each). The bolt is irregularly bent, with energy flowing along it and small branches.
  - **Cleaners** eat only drifting pieces of 1, 2 or 3 voxels, the nearest first — never the planet or bigger pieces. With no such piece about they fly with the swarm.
  - **Drills** fly to the nearest voxel, turn their nose towards the planet's centre (a little off it, at random) and drill a straight tunnel in, with a turning orange spiral bit: everything around the bit is gone — 0.75 × your Power (about 0.75 voxels at the default Power), a point each. Once through (or after 60 units) they fly on to their next bite. Tunnels often cut pieces loose for the tugs and cleaners. On a drifting piece a drill eats like an eater.

## Multiplayer

The start screen offers **Single player**, **Multiplayer · Co-op** and **Multiplayer · PvP**. Choosing a multiplayer mode opens a room: click **Copy link** and send it — others join by opening the link (up to 4 players). A room always starts from scratch — a fresh planet 1, no points or upgrades — even if you were playing single player before (only your settings panel stays). The match begins when every player in the room has pressed **Start** (**Not ready** takes it back).

- **Co-op** — everyone eats the same planet together; the scoreboard shows how many voxels each player has eaten (the summary after each planet shows the shares).
- **PvP** — a race on the same planet: whoever eats more of it wins the planet.

Every player has their own swarm (Blue, Pink, Green, Violet), tunnel and settings. After each planet a summary shows who ate how much of it (and in PvP who won it); the next planet comes once everyone has pressed **Next planet**. The scoreboard shows each player's ping (the host is marked "host"), the room panel shows your connection, and a short notice appears when someone joins, leaves or loses the connection. Spawn points are spread evenly around the planet (2 players opposite each other, 3 a third of a turn apart, 4 a quarter). It runs peer to peer over WebRTC ([PeerJS](https://peerjs.com/)); the host's browser runs the game. Details: [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).

## Troubleshooting

- **"Room not found"** — the link is wrong or the room is closed (the host left or closed the tab). Ask the host for a new link.
- **"This room is full"** — the room already has 4 players.
- **Stuck on "Joining…" or "Could not reach the connection server"** — the PeerJS server that introduces the browsers could not be reached, or a strict network (some company, school or mobile networks) blocks direct connections between browsers. The game has no relay (TURN) server, so try another network.
- **The game stopped for everyone** — the host switched to another tab or minimised the browser; browsers pause games in background tabs. It continues when the host comes back.
- **"Lost the connection to the host"** / **"…: connection lost"** — no messages for 10 seconds or the connection broke without a goodbye (network drop, sleeping laptop). Rejoin with the same link while the room is open.
- **A high ping** next to a player means slow updates for that player; it doesn't slow down the others.

## Running locally

The code uses ES modules, so it has to be served over HTTP (opening `index.html` straight from disk won't work):

```bash
npx serve .
# or
python -m http.server
```

Three.js r128 (cdnjs) and PeerJS 1.5.4 (unpkg) are loaded from CDNs.

Browser tests (single player and multiplayer with a local PeerJS server) are in `tests/` — see [tests/README.md](tests/README.md).

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — versions and what changed
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — folders and modules, how the big classes are split over files, the frame loop, the swarm, the planet and performance
- [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md) — rooms, roles and the network protocol
- [docs/CONFIG.md](docs/CONFIG.md) — what the values in `js/config.js` do and what changing them does
- [tests/README.md](tests/README.md) — running the browser tests
- [CONTEXT.md](CONTEXT.md) — project context: decisions, publishing and testing, to pick the project up again

## Project structure

```
index.html            page, search metadata (title, description, keywords, link previews, structured data)
og-image.png          1200×630 thumbnail for link previews
favicon.svg, favicon-48.png, apple-touch-icon.png
sitemap.xml           sitemap for Google Search Console
.github/workflows/    GitHub Pages deployment
css/                  one stylesheet per part of the page (base, hud, panel, lobby, menu, summary, points, tree)
js/
  main.js               entry point: start screen, single player, hosting or joining a room
  config.js             all game, network and slider parameters
  version.js            game version
  core/                 rules without graphics: Leader (the swarm's "brain"), SkillTree (upgrades)
  three/game/           Game3D (scene, roles, planets, frame loop) and its parts: input, destruction,
                        host, guest, hud; Player (one player's swarm, brain, tunnel, settings, score)
                        and its parts: arrival, ships, upgrades
  three/swarm/          Swarm3D (the flock: feeding, collisions, drawing) and its parts: ship types,
                        a guest's copy, hyperspace, laser and storm beams, tractor beams; steering
  three/planet/         VoxelPlanet and its parts (look, eating, search, runs, grid), its smooth surface,
                        drifting pieces (Fragments), level shapes
  three/effects/        lightning, support ships' bolts, orbs, black holes, debris
  three/scene/          sky, the subspace tunnel at the spawn point, click marker
  three/textures.js     glow and gradient textures shared by the effects
  net/                  multiplayer host and guest over PeerJS, binary messages
  ui/                   HUD, settings panel, ship types, level switch, menus, summary, upgrade tree
  utils/                noise, terrain colours, sky colours
docs/                 architecture, multiplayer and configuration docs
tests/                browser tests (Playwright): solo, multiplayer, levels, upgrade tree and a local PeerJS server
LICENSE               MIT
```

Almost all tunable values (planet size, voxel size, levels, flock weights, eating speed, network timing, slider ranges) live in `js/config.js`; upgrade costs and the lightning's base values are in `js/core/SkillTree.js` (see [docs/CONFIG.md](docs/CONFIG.md)).

## Search & sharing

The page has a search title and description, keywords, a canonical URL, Open Graph / Twitter link previews with `og-image.png`, and `VideoGame` structured data (JSON-LD). Because the game is a 3D canvas, a short visually hidden description gives search engines text to index.

To get indexed faster, add the site in [Google Search Console](https://search.google.com/search-console) and submit `https://michalstankiewicz4-cell.github.io/Hive-Hunger/sitemap.xml`.

## License

[MIT](LICENSE) © 2026 Michał Stankiewicz
