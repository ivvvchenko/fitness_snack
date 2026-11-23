// Default data plus validation of anything read from storage or a backup file.

export const SCHEMA_VERSION = 1;
export const LIMITS = {
  stepSeconds: [10, 600],
  restSeconds: [0, 60],
  dailyGoal: [1, 10],
  nameLength: 40,
};

/** A session is saved only if at least this share of its planned time was done. */
export const MIN_COMPLETION = 0.5;

const int = (v, [lo, hi], fallback) =>
  Number.isFinite(Number(v)) && v !== null && v !== ''
    ? Math.min(hi, Math.max(lo, Math.round(Number(v))))
    : fallback;
const text = (v, fallback = '', max = LIMITS.nameLength) =>
  (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback);
const list = (v) => (Array.isArray(v) ? v : []);
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export function uid() {
  return globalThis.crypto?.randomUUID?.()
    ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultExercises() {
  return [
    { id: 'running', name: 'Running in place', emoji: '🏃' },
    { id: 'crunches', name: 'Crunches', emoji: '🔥' },
    { id: 'plank', name: 'Plank', emoji: '🪵' },
    { id: 'pushups', name: 'Push-ups', emoji: '💪' },
    { id: 'squats', name: 'Squats', emoji: '🦵' },
    { id: 'pullups', name: 'Pull-ups', emoji: '🧗' },
  ];
}

export function defaultWorkout() {
  return {
    steps: [
      { id: 's1', seconds: 60, options: ['running'], chosen: 'running' },
      { id: 's2', seconds: 60, options: ['crunches'], chosen: 'crunches' },
      { id: 's3', seconds: 60, options: ['plank', 'pushups'], chosen: 'plank' },
      { id: 's4', seconds: 60, options: ['squats', 'pullups'], chosen: 'squats' },
    ],
  };
}

export function defaultSettings() {
  return {
    dailyGoal: 2,
    restSeconds: 5,
    sound: true,
    playInSilentMode: true,
    vibrate: true,
    voice: false,
  };
}

export function defaultState() {
  return {
    v: SCHEMA_VERSION,
    exercises: defaultExercises(),
    workout: defaultWorkout(),
    settings: defaultSettings(),
    sessions: [],
  };
}

function cleanSession(raw) {
  if (!isObject(raw)) return null;
  const ended = new Date(raw.endedAt);
  if (typeof raw.id !== 'string' || !raw.id || Number.isNaN(ended.getTime())) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.day)) return null;
  const steps = list(raw.steps).filter(isObject).map((s) => {
    const planned = int(s.planned, [0, 3600], 0);
    return {
      exerciseId: text(s.exerciseId, 'unknown', 80),
      name: text(s.name, 'Exercise'),
      emoji: text(s.emoji, '⭐', 16),
      planned,
      seconds: int(s.seconds, [0, planned], 0),
    };
  });
  if (!steps.length) return null;
  const started = new Date(raw.startedAt);
  return {
    id: raw.id,
    startedAt: (Number.isNaN(started.getTime()) ? ended : started).toISOString(),
    endedAt: ended.toISOString(),
    day: raw.day,
    hour: int(raw.hour, [0, 23], ended.getHours()),
    goal: int(raw.goal, LIMITS.dailyGoal, 2),
    plannedSeconds: steps.reduce((n, s) => n + s.planned, 0),
    activeSeconds: steps.reduce((n, s) => n + s.seconds, 0),
    steps,
  };
}

/** Turns any parsed JSON into a valid state; unusable parts fall back or drop. */
export function cleanState(raw) {
  const base = defaultState();
  if (!isObject(raw)) return base;

  const seen = new Set();
  const exercises = list(raw.exercises)
    .filter((e) => isObject(e) && typeof e.id === 'string' && e.id && text(e.name))
    .filter((e) => !seen.has(e.id) && seen.add(e.id))
    .map((e) => ({ id: e.id, name: text(e.name), emoji: text(e.emoji, '⭐', 16) }));
  const library = Array.isArray(raw.exercises) ? exercises : base.exercises;
  const known = new Set(library.map((e) => e.id));

  const rawSteps = isObject(raw.workout) && Array.isArray(raw.workout.steps)
    ? raw.workout.steps
    : base.workout.steps;
  const steps = rawSteps.filter(isObject).map((s) => {
    const options = [...new Set(list(s.options))].filter((id) => known.has(id));
    return {
      id: typeof s.id === 'string' && s.id ? s.id : uid(),
      seconds: int(s.seconds, LIMITS.stepSeconds, 60),
      options,
      chosen: options.includes(s.chosen) ? s.chosen : options[0],
    };
  }).filter((s) => s.options.length);

  const s = isObject(raw.settings) ? raw.settings : {};
  const bool = (key) => (typeof s[key] === 'boolean' ? s[key] : base.settings[key]);

  return {
    v: SCHEMA_VERSION,
    exercises: library,
    workout: { steps },
    settings: {
      dailyGoal: int(s.dailyGoal, LIMITS.dailyGoal, base.settings.dailyGoal),
      restSeconds: int(s.restSeconds, LIMITS.restSeconds, base.settings.restSeconds),
      sound: bool('sound'),
      playInSilentMode: bool('playInSilentMode'),
      vibrate: bool('vibrate'),
      voice: bool('voice'),
    },
    sessions: mergeSessions([], list(raw.sessions).map(cleanSession).filter(Boolean)),
  };
}

export function mergeSessions(a, b) {
  const byId = new Map([...a, ...b].map((x) => [x.id, x]));
  return [...byId.values()].sort((x, y) => x.endedAt.localeCompare(y.endedAt));
}

/** Does this parsed JSON look like one of our backups? */
export const isBackup = (raw) =>
  isObject(raw) && Array.isArray(raw.sessions) && Array.isArray(raw.exercises) && isObject(raw.workout);
