// The workout timer, with no DOM: feed it timestamps (ms), listen to events.

/** Gaps longer than this mean the phone slept; that time is not counted. */
export const MAX_GAP_MS = 2500;

export function buildSegments(workout, exercises, { restSeconds }) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const steps = workout.steps
    .map((s) => ({ seconds: s.seconds, exercise: byId.get(s.chosen) ?? byId.get(s.options[0]) }))
    .filter((s) => s.exercise);
  const segments = [];
  steps.forEach((s, i) => {
    const prep = i === 0 ? Math.max(5, restSeconds) : restSeconds;
    if (prep > 0) segments.push({ kind: 'rest', index: i, seconds: prep, exercise: s.exercise });
    segments.push({ kind: 'work', index: i, seconds: s.seconds, exercise: s.exercise });
  });
  return segments;
}

/**
 * Events: segment(segment), beep(secondsLeft), end(segment), finish(), gap()
 * States: idle → running ⇄ paused → done
 */
export function createEngine(segments, on = {}) {
  const emit = (name, arg) => on[name]?.(arg);
  const done = segments.map(() => 0); // elapsed ms per segment
  let i = 0;
  let last = 0;
  let state = 'idle';
  let beeped = Infinity;

  const limit = () => segments[i].seconds * 1000;
  const leftMs = () => Math.max(0, limit() - done[i]);

  function enter(index) {
    i = index;
    beeped = Infinity;
    emit('segment', segments[i]);
  }

  function next() {
    emit('end', segments[i]);
    if (i + 1 >= segments.length) {
      state = 'done';
      emit('finish');
      return false;
    }
    enter(i + 1);
    return true;
  }

  return {
    get state() { return state; },
    get segment() { return segments[i]; },
    get leftMs() { return state === 'done' ? 0 : leftMs(); },
    get progress() { return state === 'done' ? 1 : done[i] / limit(); },

    start(now) {
      if (state !== 'idle' || !segments.length) return;
      state = 'running';
      last = now;
      enter(0);
    },

    tick(now) {
      if (state !== 'running') return;
      let dt = now - last;
      last = now;
      if (dt <= 0) return;
      if (dt > MAX_GAP_MS) {
        state = 'paused';
        emit('gap');
        return;
      }
      while (dt > 0) {
        const use = Math.min(dt, leftMs());
        done[i] += use;
        dt -= use;
        if (leftMs() > 0) break;
        if (!next()) return;
      }
      const s = Math.ceil(leftMs() / 1000);
      if (s <= 3 && s >= 1 && s < beeped) {
        beeped = s;
        emit('beep', s);
      }
    },

    pause(now) {
      if (state !== 'running') return;
      this.tick(now);
      if (state === 'running') state = 'paused';
    },

    resume(now) {
      if (state !== 'paused') return;
      state = 'running';
      last = now;
    },

    /** Jump to the next segment; time already done still counts. */
    skip(now) {
      if (state === 'running') this.tick(now);
      if (state === 'running' || state === 'paused') next();
    },

    /** Work done so far, one entry per exercise. */
    results() {
      return segments.flatMap((seg, n) => (seg.kind === 'work' ? [{
        exerciseId: seg.exercise.id,
        name: seg.exercise.name,
        emoji: seg.exercise.emoji,
        planned: seg.seconds,
        seconds: Math.round(done[n] / 1000),
      }] : []));
    },
  };
}
