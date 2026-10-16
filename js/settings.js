/**
 * Player settings from the Settings menu (mouse, graphics), remembered in this browser.
 * Not game rules: every player has their own and they never go over the network.
 *
 * settings.get(key) / settings.set(key, value); settings.onChange(fn) calls fn(key, value).
 */

export const SETTING_DEFAULTS = Object.freeze({
  rotateSpeed: 1,     // camera turning: × CONFIG.camera.rotateSpeed (slider 0.25 … 3)
  zoomSpeed: 1,       // mouse wheel: × CONFIG.camera.zoomSpeed (slider 0.25 … 3)
  fps: false,         // FPS counter (bottom right)
  resolution: 'native', // render resolution: 0.5, 0.75, 1 (× CSS pixels) or 'native' (the screen's, at most 2×)
  antialias: true,    // smooth edges
  effects: 'high',    // amount of debris and sparks: 'high' | 'medium' | 'low'
});

/** How much of the debris and sparks is made, by the `effects` setting. */
export const EFFECTS_SCALE = Object.freeze({ high: 1, medium: 0.5, low: 0.2 });

const STORAGE_KEY = 'hive-hunger-settings';

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    const out = { ...SETTING_DEFAULTS };
    for (const k of Object.keys(SETTING_DEFAULTS)) if (k in saved) out[k] = saved[k];
    return out;
  } catch {
    return { ...SETTING_DEFAULTS };
  }
}

const values = load();
const listeners = [];

export const settings = {
  get(key) {
    return values[key];
  },

  set(key, value) {
    if (values[key] === value) return;
    values[key] = value;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
      // private window / storage blocked: the setting still applies until the page is closed
    }
    for (const fn of listeners) fn(key, value);
  },

  onChange(fn) {
    listeners.push(fn);
  },

  /** Back to the defaults. */
  reset() {
    for (const [k, v] of Object.entries(SETTING_DEFAULTS)) this.set(k, v);
  },
};
