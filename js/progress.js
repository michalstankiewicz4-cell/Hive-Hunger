/**
 * Single player's progress on the solar system map: which bodies have been eaten (kept in this
 * browser). Everything playable is open from the start for now; the ticks and the "next mission"
 * marker come from here.
 */
const KEY = 'hive-hunger-progress';

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

export const progress = {
  done: load(),

  /** A new game / Delete save game: nothing eaten yet. */
  clear() {
    this.done.clear();
    try { localStorage.removeItem(KEY); } catch { /* (nothing kept anyway) */ }
  },

  /** Back to a saved game's list (Continue). */
  set(ids) {
    this.done = new Set(ids);
    try { localStorage.setItem(KEY, JSON.stringify([...this.done])); } catch { /* (private window: only for now) */ }
  },

  /** Body `id` was eaten. */
  complete(id) {
    this.done.add(id);
    try { localStorage.setItem(KEY, JSON.stringify([...this.done])); } catch { /* (private window: only for now) */ }
  },
};
