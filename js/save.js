/**
 * Single player's saved game (one slot, kept in this browser): written by "Save and exit" in the
 * Esc menu, read by Continue (Single player asks: continue or a new game), removed by a new game or
 * Settings → Delete save game. What is in it: see Game3D.saveData / loadSave.
 */
const KEY = 'hive-hunger-save';

export const savedGame = {
  /** The save, or null. */
  read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && v.v === 1 ? v : null;
    } catch {
      return null;
    }
  },

  has() {
    return Boolean(this.read());
  },

  /** Keeps `data`; false if the browser wouldn't (a private window, storage full). */
  write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, at: Date.now(), ...data }));
      return true;
    } catch {
      return false;
    }
  },

  clear() {
    try { localStorage.removeItem(KEY); } catch { /* (nothing kept anyway) */ }
  },
};

/** Bytes ↔ text for the save (the eaten voxels are run lengths, see VoxelPlanet.eatenRuns). */
export const bytesToText = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const textToBytes = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
