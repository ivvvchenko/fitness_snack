import { cleanState, defaultState, isBackup, mergeSessions } from './model.js';

const KEY = 'fitness-snack:v1';

/** Small observable store persisted to localStorage (injectable for tests). */
export function createStore(storage) {
  const listeners = new Set();
  let state = load();
  let writable = true;

  function load() {
    let raw = null;
    try {
      raw = storage.getItem(KEY);
      return raw ? cleanState(JSON.parse(raw)) : defaultState();
    } catch {
      // Never overwrite data we failed to read: keep a copy aside.
      try { if (raw) storage.setItem(`${KEY}:unreadable`, raw); } catch { /* storage blocked */ }
      return defaultState();
    }
  }

  function notify() {
    for (const fn of listeners) fn(state);
  }

  return {
    get state() { return state; },
    /** False when the last save failed (private mode, storage full). */
    get writable() { return writable; },

    update(mutate) {
      const draft = structuredClone(state);
      mutate(draft);
      state = cleanState(draft);
      try {
        storage.setItem(KEY, JSON.stringify(state));
        writable = true;
      } catch {
        writable = false;
      }
      notify();
      return writable;
    },

    reload() {
      state = load();
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    exportJson: () => JSON.stringify({ app: 'fitness-snack', exportedAt: new Date().toISOString(), ...state }, null, 2),

    /** Restores program and settings; history is merged, never removed. */
    importJson(json) {
      let raw;
      try { raw = JSON.parse(json); } catch { throw new Error('This file is not valid JSON.'); }
      if (!isBackup(raw)) throw new Error('This file is not a Fitness Snack backup.');
      const incoming = cleanState(raw);
      const before = state.sessions.length;
      this.update((d) => {
        d.exercises = incoming.exercises;
        d.workout = incoming.workout;
        d.settings = incoming.settings;
        d.sessions = mergeSessions(d.sessions, incoming.sessions);
      });
      return state.sessions.length - before;
    },

    resetProgram() {
      const base = defaultState();
      this.update((d) => {
        const own = d.exercises.filter((e) => !base.exercises.some((b) => b.id === e.id));
        d.exercises = [...base.exercises, ...own];
        d.workout = base.workout;
      });
    },

    eraseAll() {
      const base = defaultState();
      this.update((d) => Object.assign(d, base));
    },
  };
}
