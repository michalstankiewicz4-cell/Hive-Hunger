import { settings, EFFECTS_SCALE } from '../../settings.js';

const THREE = window.THREE;

/**
 * Graphics settings (Settings menu → Graphics): render resolution, smooth edges (antialiasing —
 * a new renderer, since WebGL can't switch it on a live one), amount of effects, and the frames
 * per second for the FPS counter.
 * (Part of Game3D: these become its methods.)
 */
export const Graphics = {
  /** A renderer with the current settings, its canvas in `container` (in place of the old one). */
  makeRenderer(container) {
    const old = this.renderer;
    this.renderer = new THREE.WebGLRenderer({ antialias: Boolean(settings.get('antialias')) });
    this.renderer.setPixelRatio(this.pixelRatio());
    const canvas = this.renderer.domElement;
    canvas.className = 'game-canvas';
    if (old) {
      // what was drawn into a texture belongs to the old renderer
      this.holes.dropTarget();
      this.canvas.replaceWith(canvas);
      old.dispose();
    } else container.appendChild(canvas);
    this.canvas = canvas;
    if (old) {
      this.bindInput(); // the mouse and touch now go to the new canvas
      this.resize();
    }
  },

  /** Pixels per CSS pixel: 'native' = the screen's (at most 2), or 0.5 / 0.75 / 1. */
  pixelRatio() {
    const r = settings.get('resolution');
    return r === 'native' ? Math.min(window.devicePixelRatio || 1, 2) : Number(r) || 1;
  },

  /** How much debris and how many sparks effects make (Settings → Graphics → Effects). */
  get effectsScale() {
    return EFFECTS_SCALE[settings.get('effects')] ?? 1;
  },

  /** A setting changed in the menu. */
  applyGraphics(key) {
    if (key === 'antialias') this.makeRenderer();
    else if (key === 'resolution') {
      this.renderer.setPixelRatio(this.pixelRatio());
      this.resize();
    } else if (key === 'effects') {
      this.debris.scale = this.effectsScale;
      this.orbs.scale = this.effectsScale;
    }
  },

  /** Counts drawn frames; `fps` is updated twice a second. */
  countFrame(now) {
    this.fpsFrames = (this.fpsFrames || 0) + 1;
    if (!this.fpsSince) this.fpsSince = now;
    if (now - this.fpsSince >= 500) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsSince));
      this.fpsFrames = 0;
      this.fpsSince = now;
    }
  },
};
