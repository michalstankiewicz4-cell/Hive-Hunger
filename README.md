# Hive Hunger

A 3D browser game: a swarm flies on its own, finds the nearest matter and eats a planet made of voxels. A click (or tap) gives it a target — the swarm slowly drifts there, then acts on its own again. When only scraps are left, the planet shatters and a new one appears.

**Play:** https://michalstankiewicz4-cell.github.io/Hive-Hunger/

## How the swarm behaves

The swarm moves like a flock of birds (boids): units keep their distance from each other, fly the same way as their neighbours and stay with the group. Every unit flies at the same constant speed — only its direction changes.

Eating is deliberate. At matter, every unit claims its own voxel (a "bite"), flies to it, lands on it and eats it, then picks the next one. One voxel is eaten by one unit only — bites are shared only when the planet has fewer exposed voxels left than there are units. Units never eat in passing. They don't bounce off matter or pass through it; they slide along the surface. The swarm target moves on once no free voxels are left nearby.

A planet counts as eaten only when its last voxel is gone. The swarm then flies back to its spawn point (the amber beacon), and the next planet appears once the swarm has gathered there. The planet slowly spins.

## Controls

- **Click / tap** — send the swarm there (a pulsing ring marks the spot): every unit drops its current bite, the swarm flies over (around the planet, not through it) and starts eating at the clicked spot. A unit stuck in a corner of a crater or tunnel bites through the blocking voxel (if it isn't someone else's) and carries on
- **Click the beacon** (amber marker at the spawn point) — call the swarm back home; it stops eating and waits there until you click the planet again
- **Right mouse button / two fingers** — rotate the camera
- **Mouse wheel** — zoom
- **Panel in the top-right corner** — adjust live:
  - **Units** — number of units in the swarm
  - **Speed** — the shared flying speed
  - **Power** — radius of the crater a unit eats out of its bite
  - **Spacing** — distance units keep from each other
  - **Cohesion** — how strongly units stay with the group
  - **Eat nearest block** (test mechanic) — when on, every unit flies straight from the voxel it just ate to the nearest uneaten, unclaimed voxel; no free flying, only spacing between units is kept
  - **Reset to default** — restore all settings to their starting values

## Running locally

The code uses ES modules, so it has to be served over HTTP (opening `index.html` straight from disk won't work):

```bash
npx serve .
# or
python -m http.server
```

Three.js r128 is loaded from a CDN (cdnjs).

## Project structure

```
index.html            page, search metadata (title, description, keywords, link previews, structured data)
og-image.png          1200×630 thumbnail for link previews
favicon.svg, favicon-48.png, apple-touch-icon.png
sitemap.xml           sitemap for Google Search Console
.github/workflows/    GitHub Pages deployment
css/style.css
js/
  main.js               entry point
  config.js             all game and slider parameters
  core/Leader.js        the swarm's "brain": finds matter on its own + follows clicks
  three/Game3D.js       scene, camera, input, game loop
  three/VoxelPlanet.js  voxel planet + atmosphere
  three/Swarm3D.js      the flock (boids) with collisions and feeding
  three/Debris3D.js     debris
  three/ClickMarker.js  ring marking the clicked spot
  three/SpawnBeacon.js  beacon at the spawn point (call the swarm back)
  three/Space3D.js      sky (nebulae + stars)
  ui/Hud.js             planet counter and hints
  ui/ControlPanel.js    sliders, toggle and reset button
  utils/noise.js        3D noise / fBm
  utils/terrain.js      terrain colours
  utils/space.js        nebula and star colours
```

All tunable values (planet size, voxel size, flock weights, eating speed, slider ranges) live in `js/config.js`.

## Search & sharing

The page has a search title and description, keywords, a canonical URL, Open Graph / Twitter link previews with `og-image.png`, and `VideoGame` structured data (JSON-LD). Because the game is a 3D canvas, a short visually hidden description gives search engines text to index.

To get indexed faster, add the site in [Google Search Console](https://search.google.com/search-console) and submit `https://michalstankiewicz4-cell.github.io/Hive-Hunger/sitemap.xml`.
