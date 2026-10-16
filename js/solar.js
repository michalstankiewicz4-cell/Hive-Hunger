/**
 * The solar system map (SolarMap): every body the swarm goes through, in the order of the missions —
 * from the outermost (a belt of small asteroids beyond Pluto) in towards the Sun. Scaled for the game,
 * not real: orbits and sizes are in map units and only keep the order and roughly who is big.
 *
 *   id      key (a mission's level in CONFIG.levels names it as `body`)
 *   name, kind   shown on the map card
 *   type    'belt' (a ring of small rocks: `orbit` = inner edge, `width`), 'star', 'planet', 'dwarf', 'moon'
 *   parent  a moon's planet (its `orbit` is then round the planet)
 *   orbit   distance from the Sun (or the planet); `size` = the body's radius on the map
 *   speed   how fast it goes round on the map (radians per second); `tilt` = orbit tilt (radians)
 *   color   [r, g, b] on the map and in the card's picture; `ring` = Saturn-like rings
 *   text    what it is and the task
 * A body is playable when CONFIG.levels has a level for it; the others are on the map as "coming soon".
 */
export const SOLAR = Object.freeze([
  { id: 'kuiper', name: 'Kuiper Belt', kind: 'Belt of small icy asteroids', type: 'belt', orbit: 60, width: 6, speed: 0.004, color: [176, 190, 214],
    text: 'Far beyond Neptune, a cold ring of small icy rocks — the first stop on the way in. Small bites for a young swarm.' },
  { id: 'pluto', name: 'Pluto', kind: 'Dwarf planet', type: 'dwarf', orbit: 54, size: 0.45, speed: 0.008, tilt: 0.3, color: [214, 186, 160],
    text: 'A small frozen world of nitrogen ice with a heart-shaped plain.' },
  { id: 'charon', name: 'Charon', kind: 'Moon of Pluto', type: 'moon', parent: 'pluto', orbit: 1.1, size: 0.24, speed: 0.6, color: [150, 146, 140],
    text: 'Pluto’s big moon — so big the two circle each other.' },
  { id: 'neptune', name: 'Neptune', kind: 'Ice giant', type: 'planet', orbit: 48, size: 1.5, speed: 0.011, color: [70, 110, 230],
    text: 'The windiest planet: deep blue, cold and far from the Sun.' },
  { id: 'triton', name: 'Triton', kind: 'Moon of Neptune', type: 'moon', parent: 'neptune', orbit: 2.6, size: 0.3, speed: 0.5, color: [200, 196, 190],
    text: 'Neptune’s largest moon, circling backwards, with geysers of nitrogen.' },
  { id: 'uranus', name: 'Uranus', kind: 'Ice giant', type: 'planet', orbit: 42, size: 1.55, speed: 0.014, color: [150, 214, 222], ring: [0.82, 0.25],
    text: 'A pale blue giant lying on its side, with thin dark rings.' },
  { id: 'saturn', name: 'Saturn', kind: 'Gas giant', type: 'planet', orbit: 35, size: 2.1, speed: 0.018, color: [222, 196, 140], ring: [1, 0.55],
    text: 'The ringed giant, light enough to float in water.' },
  { id: 'titan', name: 'Titan', kind: 'Moon of Saturn', type: 'moon', parent: 'saturn', orbit: 4.4, size: 0.36, speed: 0.4, color: [214, 160, 70],
    text: 'Saturn’s largest moon, under a thick orange haze, with lakes of methane.' },
  { id: 'jupiter', name: 'Jupiter', kind: 'Gas giant', type: 'planet', orbit: 28, size: 2.5, speed: 0.024, color: [210, 170, 130],
    text: 'The biggest planet, striped with storms, the Great Red Spot among them.' },
  { id: 'europa', name: 'Europa', kind: 'Moon of Jupiter', type: 'moon', parent: 'jupiter', orbit: 4.6, size: 0.28, speed: 0.45, color: [220, 206, 180],
    text: 'An icy moon with an ocean under its cracked shell.' },
  { id: 'io', name: 'Io', kind: 'Moon of Jupiter', type: 'moon', parent: 'jupiter', orbit: 3.6, size: 0.3, speed: 0.6, color: [232, 210, 90],
    text: 'The most volcanic place in the solar system, yellow with sulphur.' },
  { id: 'asteroids', name: 'Asteroid Belt', kind: 'Belt of rocky asteroids', type: 'belt', orbit: 20, width: 3, speed: 0.03, color: [150, 136, 120],
    text: 'Rocks left over from the birth of the planets, between Mars and Jupiter.' },
  { id: 'mars', name: 'Mars', kind: 'Planet', type: 'planet', orbit: 16.5, size: 0.7, speed: 0.04, color: [200, 96, 60],
    text: 'The red planet: rusty deserts, giant volcanoes and polar caps.' },
  { id: 'deimos', name: 'Deimos', kind: 'Moon of Mars', type: 'moon', parent: 'mars', orbit: 1.5, size: 0.12, speed: 0.7, color: [150, 136, 120],
    text: 'The smaller of Mars’ two little moons, a lumpy rock.' },
  { id: 'phobos', name: 'Phobos', kind: 'Moon of Mars', type: 'moon', parent: 'mars', orbit: 1.05, size: 0.14, speed: 1.1, color: [130, 118, 104],
    text: 'Mars’ inner moon, slowly falling towards the planet.' },
  { id: 'earth', name: 'Earth', kind: 'Planet', type: 'planet', orbit: 13, size: 0.9, speed: 0.055, color: [60, 120, 200],
    text: 'Oceans, continents, ice caps and clouds — a planet full of life.' },
  { id: 'moon', name: 'Moon', kind: 'Moon of Earth', type: 'moon', parent: 'earth', orbit: 1.7, size: 0.27, speed: 0.5, color: [190, 190, 186],
    text: 'Earth’s grey companion, covered in craters.' },
  { id: 'venus', name: 'Venus', kind: 'Planet', type: 'planet', orbit: 9.8, size: 0.85, speed: 0.07, color: [230, 200, 140],
    text: 'Hidden under thick, scorching clouds — the hottest planet.' },
  { id: 'mercury', name: 'Mercury', kind: 'Planet', type: 'planet', orbit: 7, size: 0.45, speed: 0.1, color: [160, 150, 140],
    text: 'The smallest planet, closest to the Sun: grey and cratered.' },
  { id: 'sun', name: 'Sun', kind: 'Star', type: 'star', orbit: 0, size: 3.4, speed: 0, color: [255, 200, 80],
    text: 'The end of the journey: the star at the centre of it all.' },
]);

/** A body by id. */
export const bodyById = (id) => SOLAR.find((b) => b.id === id) || null;

/** The task line of a body's card. */
export const taskOf = (b) => (b.type === 'belt' ? `Task: eat every asteroid of the ${b.name}.` : `Task: eat the whole of ${b.name}.`);
