const THREE = window.THREE;

/**
 * Small canvas textures for glows and beams, shared by the effects. Stops are
 * [[offset 0…1, css colour], …].
 */

/** A w × h canvas drawn by `draw(context)`, as a texture. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'));
  return new THREE.CanvasTexture(c);
}

/** A round glow: the gradient from the centre (offset 0) to the edge (1). */
export function radialTexture(stops, size = 64) {
  const r = size / 2;
  return canvasTexture(size, size, (g) => {
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [t, col] of stops) grad.addColorStop(t, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  });
}

/** A straight gradient from (x0, y0) to (x1, y1) over a w × h canvas. */
export function linearTexture(w, h, [x0, y0, x1, y1], stops) {
  return canvasTexture(w, h, (g) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    for (const [t, col] of stops) grad.addColorStop(t, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

let band = null;
/** Across a glowing band (lightning): clear edge → soft → bright core → soft → edge. One for every user. */
export function bandGlowTexture() {
  return band || (band = linearTexture(4, 32, [0, 0, 0, 32], [
    [0, 'rgba(255,255,255,0)'], [0.3, 'rgba(255,255,255,0.35)'], [0.5, 'rgba(255,255,255,1)'],
    [0.7, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)'],
  ]));
}
