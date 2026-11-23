import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, clock, dayDiff, minutesLabel, weekday } from '../js/dates.js';
import { cleanState, defaultState } from '../js/model.js';
import { levelFor, replay } from '../js/game.js';
import { byExercise, calendar, historyGroups, lastDays, weekSummary } from '../js/stats.js';
import { buildSegments, createEngine } from '../js/engine.js';
import { createStore } from '../js/store.js';

let n = 0;
function session(day, over = {}) {
  n += 1;
  const seconds = over.seconds ?? 60;
  const steps = over.steps ?? ['running', 'crunches', 'plank', 'squats'].map((id) => ({
    exerciseId: id, name: id, emoji: '⭐', planned: 60, seconds,
  }));
  return {
    id: over.id ?? `x${n}`,
    day,
    startedAt: `${day}T10:00:00.000Z`,
    endedAt: `${day}T${over.time ?? `10:${String(n % 60).padStart(2, '0')}:00.000`}Z`,
    hour: over.hour ?? 12,
    goal: over.goal ?? 2,
    plannedSeconds: steps.reduce((t, s) => t + s.planned, 0),
    activeSeconds: steps.reduce((t, s) => t + s.seconds, 0),
    steps,
  };
}
const full = (day) => [session(day, { time: '10:00:00.000' }), session(day, { time: '18:00:00.000' })];

function memory(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m };
}

test('dates cross months, years and DST', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(dayDiff('2026-03-28', '2026-03-30'), 2);
  assert.equal(weekday('2026-11-23'), 0);
  assert.equal(clock(59.6), '1:00');
  assert.equal(minutesLabel(3900), '1 h 5 min');
});

test('default program matches the brief: 4 one-minute steps, two with alternatives', () => {
  const { workout, settings } = defaultState();
  assert.deepEqual(workout.steps.map((s) => s.seconds), [60, 60, 60, 60]);
  assert.deepEqual(workout.steps.map((s) => s.options), [['running'], ['crunches'], ['plank', 'pushups'], ['squats', 'pullups']]);
  assert.equal(settings.dailyGoal, 2);
});

test('cleanState survives junk and repairs references', () => {
  for (const junk of [null, 5, 'x', [], {}, { exercises: 3, workout: [], sessions: {} }]) {
    assert.equal(cleanState(junk).workout.steps.length, 4);
  }
  const s = defaultState();
  s.exercises = s.exercises.filter((e) => e.id !== 'plank' && e.id !== 'running');
  s.workout.steps[1].seconds = 99999;
  s.sessions = [session('2026-11-01'), { id: 'bad' }, null, session('not-a-day')];
  const c = cleanState(s);
  assert.equal(c.workout.steps.length, 3, 'step with no exercises left is dropped');
  assert.equal(c.workout.steps[1].chosen, 'pushups', 'choice falls back to remaining option');
  assert.equal(c.workout.steps[0].seconds, 600);
  assert.equal(c.sessions.length, 1);
});

test('an intentionally empty workout stays empty', () => {
  const s = defaultState();
  s.workout.steps = [];
  assert.equal(cleanState(s).workout.steps.length, 0);
});

test('levels', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(99).level, 1);
  assert.equal(levelFor(100).level, 2);
  assert.equal(levelFor(300).level, 3);
  assert.equal(levelFor(1e6).title, 'Legend');
});

test('XP: full session 50, goal adds 20 once, streak bonus from day two', () => {
  const g = replay([...full('2026-11-20'), session('2026-11-20', { time: '20:00:00.000' })], '2026-11-20');
  assert.deepEqual([...g.bySession.values()].map((b) => b.total), [50, 70, 50]);
  const g2 = replay([...full('2026-11-20'), ...full('2026-11-21')], '2026-11-21');
  assert.deepEqual([...g2.bySession.values()].map((b) => b.total), [50, 70, 50, 80]);
});

test('streak counts goal days only, stays alive until a day is missed', () => {
  const s = [...full('2026-11-19'), ...full('2026-11-20'), ...full('2026-11-21'), session('2026-11-22')];
  assert.equal(replay(s, '2026-11-21').streak, 3);
  assert.equal(replay(s, '2026-11-22').streak, 3, 'one session today: still alive');
  assert.equal(replay(s, '2026-11-23').streak, 0, 'missed the goal on the 22nd');
  assert.equal(replay(s, '2026-11-23').bestStreak, 3);
});

test('changing the goal does not rewrite past days', () => {
  const s = [session('2026-11-20', { goal: 1 }), session('2026-11-21', { goal: 3 })];
  const g = replay(s, '2026-11-21');
  assert.ok(g.metDays.has('2026-11-20'));
  assert.ok(!g.metDays.has('2026-11-21'));
});

test('a later session on an earlier day (travel) keeps the streak', () => {
  const s = [session('2026-11-20', { goal: 1 }), session('2026-11-21', { goal: 1 })];
  const back = { ...session('2026-11-19', { goal: 1 }), endedAt: '2026-11-21T23:00:00.000Z' };
  assert.equal(replay([...s, back], '2026-11-21').streak, 2);
});

test('badges unlock once, with their day', () => {
  const g = replay(full('2026-11-20'), '2026-11-20');
  assert.equal(g.badges.get('first'), '2026-11-20');
  assert.ok(g.badges.has('goal'));
  assert.ok(!g.badges.has('streak3'));
  const unlocked = [...g.bySession.values()].map((b) => b.unlocked.map((u) => u.id));
  assert.deepEqual(unlocked, [['first'], ['goal']]);
});

test('stats', () => {
  const s = [...full('2026-11-16'), session('2026-11-23'), session('2026-11-22')];
  const days = lastDays(s, 14, '2026-11-23');
  assert.equal(days.length, 14);
  assert.equal(days.at(-1).count, 1);
  assert.equal(days.find((d) => d.day === '2026-11-16').count, 2);
  const w = weekSummary(s, '2026-11-23');
  assert.deepEqual([w.sessions, w.prevSessions], [1, 3]);
  const cal = calendar(s, 12, '2026-11-23');
  assert.equal(cal.length, 12);
  assert.equal(cal.at(-1)[0].day, '2026-11-23');
  assert.ok(cal.at(-1)[1].future);
  assert.equal(byExercise(s)[0].seconds, 240);
  assert.deepEqual(historyGroups(s).map((g) => g.items.length), [1, 1, 2]);
});

function run(engine, from, to, step = 100) {
  for (let t = from; t <= to; t += step) engine.tick(t);
}

test('engine plays the whole program in order with countdown and end events', () => {
  const { workout, exercises } = defaultState();
  const segs = buildSegments(workout, exercises, { restSeconds: 5 });
  assert.deepEqual(segs.map((s) => s.kind), ['rest', 'work', 'rest', 'work', 'rest', 'work', 'rest', 'work']);
  const log = { end: 0, finish: 0, beeps: [] };
  const e = createEngine(segs, {
    end: (s) => { if (s.kind === 'work') log.end += 1; },
    finish: () => { log.finish += 1; },
    beep: (s) => log.beeps.push(s),
  });
  e.start(0);
  run(e, 0, 270000);
  assert.equal(e.state, 'done');
  assert.equal(log.end, 4);
  assert.equal(log.finish, 1);
  assert.deepEqual(log.beeps.slice(0, 3), [3, 2, 1]);
  assert.equal(log.beeps.length, 24);
  assert.deepEqual(e.results().map((r) => r.seconds), [60, 60, 60, 60]);
});

test('zero rest still gives a get-ready before the first exercise only', () => {
  const { workout, exercises } = defaultState();
  const segs = buildSegments(workout, exercises, { restSeconds: 0 });
  assert.deepEqual(segs.map((s) => s.kind), ['rest', 'work', 'work', 'work', 'work']);
});

test('pause, sleep gaps and skip are accounted for', () => {
  const ex = defaultState().exercises;
  const seg = (id, seconds) => ({ kind: 'work', index: 0, seconds, exercise: ex.find((x) => x.id === id) });
  let gaps = 0;
  const e = createEngine([seg('plank', 60), seg('squats', 60)], { gap: () => { gaps += 1; } });
  e.start(0);
  run(e, 0, 10000);
  e.pause(10000);
  run(e, 10000, 50000);
  assert.equal(Math.round(e.leftMs / 1000), 50, 'paused time is not counted');
  e.resume(50000);
  run(e, 50000, 55000);
  e.tick(500000);
  assert.equal(gaps, 1);
  assert.equal(e.state, 'paused');
  assert.equal(Math.round(e.leftMs / 1000), 45, 'sleep time is not counted');
  e.skip(500000);
  assert.equal(e.state, 'paused', 'skipping while paused stays paused');
  e.skip(500000);
  assert.equal(e.state, 'done');
  assert.deepEqual(e.results().map((r) => r.seconds), [15, 0]);
});

test('store persists, keeps unreadable data aside and reports failed writes', () => {
  const mem = memory();
  const a = createStore(mem);
  a.update((d) => { d.sessions.push(session('2026-11-20')); });
  assert.equal(createStore(mem).state.sessions.length, 1);

  const broken = memory({ 'fitness-snack:v1': '{oops' });
  assert.equal(createStore(broken).state.sessions.length, 0);
  assert.equal(broken.m.get('fitness-snack:v1:unreadable'), '{oops');

  const full2 = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const c = createStore(full2);
  assert.equal(c.update(() => {}), false);
});

test('backup round trip merges history without duplicates', () => {
  const a = createStore(memory());
  a.update((d) => { d.sessions.push(session('2026-11-20', { id: 'same' })); d.settings.dailyGoal = 3; });
  const json = a.exportJson();
  const b = createStore(memory());
  b.update((d) => { d.sessions.push(session('2026-11-21', { id: 'other' })); });
  assert.equal(b.importJson(json), 1);
  assert.equal(b.importJson(json), 0);
  assert.equal(b.state.settings.dailyGoal, 3);
  assert.throws(() => b.importJson('nope'), /not valid JSON/);
  assert.throws(() => b.importJson('{"a":1}'), /not a Fitness Snack backup/);
});

test('resetting the program keeps custom exercises and history', () => {
  const a = createStore(memory());
  a.update((d) => {
    d.exercises.push({ id: 'burpees', name: 'Burpees', emoji: '🐸' });
    d.workout.steps = [];
    d.sessions.push(session('2026-11-20'));
  });
  a.resetProgram();
  assert.equal(a.state.workout.steps.length, 4);
  assert.ok(a.state.exercises.some((e) => e.id === 'burpees'));
  assert.equal(a.state.sessions.length, 1);
});

test('the XP lines shown after a session add up to its total', () => {
  const g = replay([...full('2026-11-19'), ...full('2026-11-20'), ...full('2026-11-21')], '2026-11-21');
  for (const b of g.bySession.values()) assert.equal(b.time + b.session + b.goal + b.streak, b.total);
  const last = [...g.bySession.values()].at(-1);
  assert.deepEqual([last.streakDays, last.streak], [3, 15]);
});
