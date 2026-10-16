# Hive Hunger

A free 3D browser game: a swarm flies on its own, finds the nearest matter and eats planets made of voxels — mission by mission across the solar system, from the Kuiper Belt in to the Sun — alone (with a saved game), or with up to four players in Co-op or PvP.

**Play:** https://michalstankiewicz4-cell.github.io/Hive-Hunger/ · **Version:** 0.42.1 ([changelog](CHANGELOG.md))

## How the swarm behaves

The swarm moves like a flock of birds (boids): units keep their distance from each other, fly the same way as their neighbours and stay with the group. Every unit flies at the same constant speed — only its direction changes.

Eating is deliberate. Every unit claims the nearest uneaten, unclaimed voxel to itself (a "bite"), flies straight to it, lands on it and eats it, then picks the next nearest one — no free flying while eating, only a little spacing between units. One voxel is eaten by one unit only — bites are shared only when the planet has fewer exposed voxels left than there are units. Units never eat in passing. They don't bounce off matter or pass through it; they slide along the surface. The swarm target moves on once no free voxels are left nearby.

The page opens with a **loader** (the title and a progress bar over a blurred picture) while the start picture, the 3D engine, multiplayer and the game load; then the **start screen**: the picture of a voxel ship cutting into a voxel planet with the title and the menu (Single player, Co-op, PvP, Ship guide, Settings) beside it. The game starts from a **map of the solar system** (single player and multiplayer): the Sun in the middle, the orbits, the planets with their moons and two belts, in 3D, seen from above at an angle — drag to turn it, the wheel (or two fingers) to zoom. The missions go from the outside in: the **Kuiper Belt** (a long, very slightly bent band of small icy asteroids, seen at an angle), Pluto and Charon, Neptune and Triton, Uranus, Saturn and Titan, Jupiter, Europa and Io, the Asteroid Belt, Mars, Deimos and Phobos, Earth and the Moon, Venus, Mercury — and the Sun. A click on a body opens its card: a picture, what it is, the task and **Start**. For now two missions can be played — the Kuiper Belt and **Earth** (the usual planet); the other bodies are on the map as *coming soon*. In single player every playable mission is open; when a planet is eaten the ships jump to hyperspace and you are back on the map, the body ticked (remembered in this browser) and the next mission marked. In multiplayer the missions go in order — the map shows where the room is going, behind the waiting room and the summary. Every planet is drawn as a smooth surface: no steps — slopes, rounded corners and craters. It is graphics only: underneath, the swarm still eats voxels — every voxel is still 1 point.

When eating cuts a piece off — a part no longer connected to the rest — it comes loose: every part smaller than the rest gently drifts away and turns (parts of equal size all stay). It stops at most 4 units from where it came off, and big pieces turn slowly. A piece bitten through breaks up again the same way, and so on until it is eaten. The swarm can chase it and eat it like any other voxel, for the same points; a drone that hasn't eaten anything for 10 s stops for half a second and takes another bite (or the same one, if there is no other). A planet counts as eaten only when its last voxel is gone, drifting pieces included. The ships then escape into hyperspace — one after another at random moments (several at once in a big swarm), each speeding off with a blue streak behind it — and the next planet appears once they are all gone. Ships arrive through a subspace tunnel at the spawn point: it opens into a wide blue vortex, the ships fly out of it, and it closes to a small swirl (click it to call the swarm back; it opens for a moment to take in a piece a tug brings home). The camera never turns by itself — only when you turn it.

## Points and upgrades

Every eaten voxel is 1 point (counter at the top). **Tab** (or a click on the counter) opens the upgrade tree, growing upwards over levels 0–5 with links across branches: traits of the whole swarm (diamonds) — Brood (+units), Wings (+speed), Jaws (+bite radius) and Chain lightning (a bolt that jumps between your drones every few seconds and weakens the voxels on its way, with Arcs, Voltage and Capacitor) — and every ship type (hexagons) with its own properties (small circles). For now the ships, their properties, Agility and Swarm sense are *coming soon*. Upgrades add to the settings panel. Voxels show damage as they are eaten: the surface sinks in and darkens before the voxel breaks apart.

## Controls

- **Click / tap** — send the swarm there (a pulsing ring marks the spot): every unit drops its current bite, the swarm flies over (around the planet, not through it) and starts eating at the clicked spot. A unit stuck in a corner of a crater or tunnel bites through the blocking voxel (if it isn't someone else's) and carries on
- **Click the tunnel** (the small blue vortex at the spawn point) — call the swarm back home; it stops eating and waits there until you click the planet again
- **Right mouse button / two fingers** — turn the camera, any way round (it can go over the poles)
- **Mouse wheel** — zoom
- **Tab** (or a click on the points counter) — upgrade tree (Esc closes it); in single player the game stands still while it is open
- **Space** — single player: pause (nothing moves, the camera still turns; "Paused" at the bottom), Space again carries on
- **Esc** — single player: pause — **Resume** (or Esc again), **Save game** (saves and stays paused), **Save and exit** (keeps the game in this browser and goes to the main menu), **Exit to main menu** (without saving), **Settings**. With a saved game, **Single player** says so under it (*New game or continue your saved game*) and asks: **Continue** (the same planet with the voxels eaten so far, your points, upgrades and settings) or **New game** (the save and the map's ticks are deleted). **Settings → Delete save game** deletes them too (it asks once more). Esc also closes the upgrade tree
- **Ship guide** (start screen) — every ship type with a small picture and what it does, attack and support ships apart, in a window that fits the screen (only the ships scroll; the title and Back stay); pointing at a ship plays its shot.
- **Settings** (start screen, waiting room, or the room panel during a match) — **Mouse** (what it does, camera turning and zoom speed), **Keyboard** (the keys) and **Graphics** (FPS counter, render resolution 50 / 75 / 100% / native, smooth edges, amount of effects Low / Medium / High). They apply at once and are remembered in your browser; **Reset settings** restores them. The game screen itself shows no description of the controls — they are listed here. — the three side by side
- **Panel in the top-right corner** — adjust your swarm live:
  - **Units** — number of units in the swarm (10–100; upgrades can't take it past 100)
  - **Speed** — the shared flying speed
  - **Power** — radius of the crater a unit eats out of its bite
  - **Turning** — how fast ships turn their nose; a ship eats only once it faces its bite
  - **Reset to default** — restore all settings to their starting values
  - **Level 1–2** (single player) — jump straight to that mission's planet (1 the Kuiper Belt, 2 Earth); the swarm comes out of its tunnel again
- **Ship types panel in the bottom-right corner** — how many of your units are yellow **Eaters**, red **Lasers**, blue **Storms**, green **Tugs**, purple **Bombers**, magenta **Orbs**, blue **Splashers**, white **Support** ships, grey **Cleaners**, orange **Drills**, copper **Piercers**, teal **Snipers** and pink **Boosters** — a slider each (linked: together they are all your units; at the start 2 of each type — 26 units). Attack ships are listed first, support ships (Tugs, Support, Cleaners, Boosters) below a line, in the same order as the Ship guide. The arrows on both sides of a slider move it by one ship. The checkbox in front of a slider locks it: it can't be moved, and moving the others never changes it. Every ship eats only once it faces its bite.
  - **Laser** ships eat their bite from 5 voxels away with a glowing red beam, but fly 10% slower.
  - **Storm** ships fire lightning from the same distance: it forks at 70% of the way into three — the bite gets 40% of a laser's damage, the two nearest voxels 30% each. When the bite is gone, the ship picks its next one like any other.
  - **Tugs** don't eat: they fly only to drifting pieces. From 10 voxels away a green tractor beam takes in the whole piece and the tug tows it home to your tunnel. There the piece is gone and you get **5 ×** the points of what is left of it — other ships (yours or other players') may eat it on the way.
  - **Bombers** fly to the nearest voxel and, touching it, blow up everything within 10 voxels (a point each) — and are gone for good (one unit fewer). The blast leaves a black hole for about 4 seconds that bends the picture around it and gently pulls in debris and drifting pieces within 15 voxels; what falls in is gone (the pieces' voxels count for the bomber's owner).
  - **Orb** ships fire, from 10 voxels away, a voxel-sized plasma orb with a pulsing glow and a fiery tail — one at a time. It flies slowly to the bite and bursts there: everything within 2 voxels is gone (a point each).
  - **Splashers** fire, from 10 voxels away, a wobbling, irregular bubble of liquid 3 voxels across that bends the view behind it like a lens — one at a time. Where it lands, a block of 3 × 3 voxels across the surface and 2 deep soaks: it weakens over 3 seconds and is then gone (points for every voxel).
  - **Support** ships don't eat: every 3 seconds each fires a white lightning bolt at your own ships — it jumps between them in a random order (up to 6 jumps) over 1.5 s and is gone after the last one; every voxel on its way is destroyed (a point each). The bolt is irregularly bent, with energy flowing along it and small branches.
  - **Cleaners** eat only drifting pieces of 1, 2 or 3 voxels, the nearest first — never the planet or bigger pieces. With no such piece about they fly with the swarm.
  - **Boosters** don't eat: they fly with the swarm, each in a gentle pink force field 5 voxels across — a ball of shimmering octagonal cells. Your own ships inside a field get +20% Power: a 20% wider crater and eating 20% harder (eaters, lasers, storms, piercers; drills drill 20% wider). Several fields at once don't add up.
  - **Drills** fly to the nearest voxel, turn their nose towards the planet's centre (a little off it, at random) and drill a straight tunnel in, with a turning orange spiral bit: everything around the bit is gone — 0.75 × your Power (about 0.75 voxels at the default Power), a point each. Once through (or after 60 units) they fly on to their next bite. Tunnels often cut pieces loose for the tugs and cleaners. On a drifting piece a drill eats like an eater.
  - **Piercers** fire from up to 20 voxels away: an orange laser with a yellow lightning winding round it in a spiral. Once aimed at a bite, a piercer locks the line through it and fires along it until it is right through — the beam always eats the 3 nearest voxels on the line at once, each a little slower than an eater (0.8 ×) — everything on the line, whoever claimed it — then keeps firing for 2 more seconds, the beam going out through the hole into space, switches off and goes on to its next bite.
  - **Snipers** fire from any distance: a sniper stops, charges for 5 seconds facing its bite and fires a thin shot that speeds up 5% for every voxel it flies, with a rounded glowing cap in front like a meteor's; it always destroys the voxel it hits. Then it moves on with the swarm for a second — never closer to the planet — stops and charges again.

## Multiplayer

The start screen offers **Single player**, **Multiplayer · Co-op** and **Multiplayer · PvP**. Choosing a multiplayer mode opens a room: click **Copy link** and send it — others join by opening the link (up to 4 players). A room always starts from scratch — the first mission (the Kuiper Belt), no points or upgrades — even if you were playing single player before (only your settings panel stays). The match begins when every player in the room has pressed **Start** (**Not ready** takes it back).

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

Three.js r128 and PeerJS 1.5.4 are in the repository (`js/vendor/`), so the game loads nothing from the internet: single player works offline (from a local server). Multiplayer still needs the internet to find the other players.

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
og-image.jpg          1200×630 thumbnail for link previews: the start screen
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
                        drifting pieces (Fragments), level shapes (the belt of asteroids too)
  three/effects/        lightning, support ships' bolts, orbs, black holes, debris
  three/scene/          sky, the subspace tunnel at the spawn point, click marker
  three/textures.js     glow and gradient textures shared by the effects
  net/                  multiplayer host and guest over PeerJS, binary messages
  ui/                   HUD, settings panel, ship types, level switch, menus, summary, upgrade tree,
                        the solar system map
  solar.js, progress.js the map's bodies (outside in); single player's finished missions
  save.js               single player's saved game (one slot in this browser)
  utils/                noise, terrain colours, sky colours
  vendor/               Three.js r128 and PeerJS 1.5.4 (kept here: no CDN), their licences
img/start.jpg         the start screen picture
docs/                 architecture, multiplayer and configuration docs
tests/                browser tests (Playwright): solo, multiplayer, levels, upgrade tree and a local PeerJS server
LICENSE               MIT
```

Almost all tunable values (planet size, voxel size, levels, flock weights, eating speed, network timing, slider ranges) live in `js/config.js`; upgrade costs and the lightning's base values are in `js/core/SkillTree.js` (see [docs/CONFIG.md](docs/CONFIG.md)).

## Search & sharing

The page has a search title and description, keywords, a canonical URL, Open Graph / Twitter link previews with `og-image.jpg` (the start screen), `VideoGame` structured data (JSON-LD: genres, single player / multiplayer / co-op, 1–4 players), and a sitemap. The page is in English; Polish keywords and a short Polish description (in the hidden text, `lang="pl"`) help it be found in Polish searches too. Because the game is a 3D canvas, a short visually hidden description gives search engines text to index.

To get indexed faster, add the site in [Google Search Console](https://search.google.com/search-console) and submit `https://michalstankiewicz4-cell.github.io/Hive-Hunger/sitemap.xml`.

## License

[MIT](LICENSE) © 2026 Michał Stankiewicz
