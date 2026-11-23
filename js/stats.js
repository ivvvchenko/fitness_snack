import { addDays, dayKey, startOfWeek } from './dates.js';

function byDay(sessions) {
  const map = new Map();
  for (const x of sessions) {
    const d = map.get(x.day) ?? { count: 0, seconds: 0 };
    d.count += 1;
    d.seconds += x.activeSeconds;
    map.set(x.day, d);
  }
  return map;
}

export function lastDays(sessions, n, today = dayKey()) {
  const map = byDay(sessions);
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - n + 1);
    return { day, ...(map.get(day) ?? { count: 0, seconds: 0 }) };
  });
}

/** Calendar grid: one entry per week (oldest first), 7 days each, Monday first. */
export function calendar(sessions, weeks, today = dayKey()) {
  const map = byDay(sessions);
  const first = addDays(startOfWeek(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const day = addDays(first, w * 7 + d);
    return { day, future: day > today, ...(map.get(day) ?? { count: 0, seconds: 0 }) };
  }));
}

export function weekSummary(sessions, today = dayKey()) {
  const thisStart = startOfWeek(today);
  const prevStart = addDays(thisStart, -7);
  const out = { sessions: 0, seconds: 0, prevSessions: 0 };
  for (const x of sessions) {
    if (x.day >= thisStart && x.day <= today) {
      out.sessions += 1;
      out.seconds += x.activeSeconds;
    } else if (x.day >= prevStart && x.day < thisStart) {
      out.prevSessions += 1;
    }
  }
  return out;
}

/** Active seconds per exercise, largest first, using the latest known name. */
export function byExercise(sessions) {
  const map = new Map();
  for (const x of sessions) {
    for (const step of x.steps) {
      const e = map.get(step.exerciseId) ?? { seconds: 0 };
      map.set(step.exerciseId, { name: step.name, emoji: step.emoji, seconds: e.seconds + step.seconds });
    }
  }
  return [...map.values()].filter((e) => e.seconds > 0).sort((a, b) => b.seconds - a.seconds);
}

/** Sessions grouped by day, newest first. */
export function historyGroups(sessions) {
  const groups = new Map();
  for (const x of [...sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt))) {
    if (!groups.has(x.day)) groups.set(x.day, []);
    groups.get(x.day).push(x);
  }
  return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([day, items]) => ({ day, items }));
}
