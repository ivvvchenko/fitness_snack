// Gamification. XP, streaks and badges are all derived by replaying the
// session history, so they can never drift out of sync with it.

import { dayDiff, dayKey } from './dates.js';

export const XP = {
  perMinute: 10,
  sessionBonus: 10,
  goalBonus: 20,
  streakPerDay: 5,
  streakCapDays: 7,
};

export const LEVEL_TITLES = [
  'Crumb', 'Nibble', 'Bite', 'Snack', 'Side Dish', 'Lunch Box',
  'Main Course', 'Feast', 'Banquet', 'Chef’s Special', 'Legend',
];

/** Total XP needed to reach a level: 0, 100, 300, 600, 1000 … */
export const xpForLevel = (level) => 50 * level * (level - 1);

export function levelFor(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
    xp,
    into: xp - floor,
    span: ceil - floor,
    toNext: ceil - xp,
  };
}

export const BADGES = [
  { id: 'first', emoji: '🌱', name: 'First bite', desc: 'Finish your first session', target: 1, value: (s) => s.sessions },
  { id: 'goal', emoji: '🎯', name: 'Full plate', desc: 'Hit your daily goal', target: 1, value: (s) => s.goalDays },
  { id: 'triple', emoji: '🍱', name: 'Extra helping', desc: 'Do 3 sessions in one day', target: 3, value: (s) => s.maxInDay },
  { id: 'streak3', emoji: '🔥', name: 'Warming up', desc: '3-day goal streak', target: 3, value: (s) => s.bestStreak },
  { id: 'streak7', emoji: '🌶️', name: 'Spicy week', desc: '7-day goal streak', target: 7, value: (s) => s.bestStreak },
  { id: 'streak30', emoji: '🌋', name: 'On fire', desc: '30-day goal streak', target: 30, value: (s) => s.bestStreak },
  { id: 's10', emoji: '🥉', name: 'Regular', desc: '10 sessions', target: 10, value: (s) => s.sessions },
  { id: 's50', emoji: '🥈', name: 'Committed', desc: '50 sessions', target: 50, value: (s) => s.sessions },
  { id: 's100', emoji: '🥇', name: 'Century', desc: '100 sessions', target: 100, value: (s) => s.sessions },
  { id: 'hour', emoji: '⏱️', name: 'One full hour', desc: '60 minutes of exercise', target: 60, value: (s) => Math.floor(s.seconds / 60) },
  { id: 'tenhours', emoji: '🚀', name: 'Ten hours', desc: '600 minutes of exercise', target: 600, value: (s) => Math.floor(s.seconds / 60) },
  { id: 'variety', emoji: '🎨', name: 'Mixed menu', desc: 'Try 6 different exercises', target: 6, value: (s) => s.exercises.size },
  { id: 'early', emoji: '🌅', name: 'Early bird', desc: 'Train before 8:00', target: 1, value: (s) => s.early },
  { id: 'night', emoji: '🦉', name: 'Night owl', desc: 'Train after 21:00', target: 1, value: (s) => s.night },
  { id: 'perfect', emoji: '💯', name: 'Clean plate', desc: '10 sessions without cutting a second', target: 10, value: (s) => s.perfect },
];

export function replay(sessions, today = dayKey()) {
  const s = {
    xp: 0, sessions: 0, seconds: 0, goalDays: 0, maxInDay: 0,
    streak: 0, bestStreak: 0, lastGoalDay: null,
    early: 0, night: 0, perfect: 0, exercises: new Set(),
  };
  const perDay = new Map();
  const metDays = new Set();
  const badges = new Map();
  const bySession = new Map();

  const ordered = [...sessions].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  for (const x of ordered) {
    const count = (perDay.get(x.day) ?? 0) + 1;
    perDay.set(x.day, count);
    s.sessions += 1;
    s.seconds += x.activeSeconds;
    s.maxInDay = Math.max(s.maxInDay, count);
    if (x.hour < 8) s.early += 1;
    if (x.hour >= 21) s.night += 1;
    if (x.activeSeconds >= x.plannedSeconds) s.perfect += 1;
    for (const step of x.steps) if (step.seconds > 0) s.exercises.add(step.exerciseId);

    const gain = {
      time: Math.round((x.activeSeconds / 60) * XP.perMinute),
      session: XP.sessionBonus,
      goal: 0,
      streak: 0,
    };
    const hitGoal = !metDays.has(x.day) && count >= x.goal;
    if (hitGoal) {
      metDays.add(x.day);
      s.goalDays += 1;
      // Travelling west can make a later session belong to an earlier day;
      // such a day must not break or restart the streak.
      const gap = s.lastGoalDay ? dayDiff(s.lastGoalDay, x.day) : null;
      if (gap === null || gap > 1) s.streak = 1;
      else if (gap === 1) s.streak += 1;
      if (gap === null || gap > 0) s.lastGoalDay = x.day;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      gain.goal = XP.goalBonus;
      if (s.streak >= 2) gain.streak = Math.min(s.streak, XP.streakCapDays) * XP.streakPerDay;
    }
    const total = gain.time + gain.session + gain.goal + gain.streak;
    const before = levelFor(s.xp).level;
    s.xp += total;

    const unlocked = BADGES.filter((b) => !badges.has(b.id) && b.value(s) >= b.target);
    for (const b of unlocked) badges.set(b.id, x.day);

    bySession.set(x.id, {
      ...gain, total, hitGoal, streakDays: s.streak, unlocked,
      levelUp: levelFor(s.xp).level > before,
    });
  }

  // A streak survives until a whole day passes without meeting the goal.
  const alive = s.lastGoalDay !== null && dayDiff(s.lastGoalDay, today) <= 1;
  return {
    totals: s,
    level: levelFor(s.xp),
    streak: alive ? s.streak : 0,
    bestStreak: s.bestStreak,
    todayDone: perDay.get(today) ?? 0,
    todayMet: metDays.has(today),
    badges,
    bySession,
    perDay,
    metDays,
  };
}
