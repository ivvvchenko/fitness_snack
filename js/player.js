// Full-screen workout player.

import { buildSegments, createEngine } from './engine.js';
import { MIN_COMPLETION, uid } from './model.js';
import { clock, dayKey } from './dates.js';
import { replay } from './game.js';
import { celebrate, confirmDialog, h } from './dom.js';
import { hush, play, releaseSound, resumeSound, say, unlockSound } from './sound.js';

let active = null;
export const isPlaying = () => Boolean(active);
export const requestQuit = () => active?.quit();

export function startWorkout(store, onExit) {
  if (active) return;
  const { workout, exercises, settings } = store.state;
  const segments = buildSegments(workout, exercises, settings);
  if (!segments.length) return;
  const total = segments.filter((s) => s.kind === 'work').length;
  const startedAt = new Date();

  unlockSound();

  // --- view -----------------------------------------------------------------
  const ui = {
    fill: h('div', { class: 'fill' }),
    dots: h('ol', { class: 'dots', 'aria-hidden': 'true' },
      Array.from({ length: total }, () => h('li', null, h('i')))),
    count: h('p', { class: 'p-count' }),
    emoji: h('div', { class: 'p-emoji', 'aria-hidden': 'true' }),
    phase: h('p', { class: 'p-phase' }),
    name: h('h1', { class: 'p-name', 'aria-live': 'polite' }),
    time: h('div', { class: 'p-time', role: 'timer' }),
    next: h('p', { class: 'p-next' }),
    pause: h('button', { class: 'p-btn main', type: 'button', onClick: () => togglePause() }, 'Pause'),
    skip: h('button', { class: 'p-btn', type: 'button', onClick: () => engine.skip(performance.now()) }),
    quit: h('button', { class: 'p-quit', type: 'button', 'aria-label': 'Quit workout', onClick: () => quit() }, '✕'),
  };
  const root = h('section', { class: 'player', 'aria-label': 'Workout' },
    ui.fill,
    h('header', null, ui.dots, ui.quit),
    h('div', { class: 'p-body' }, ui.count, ui.emoji, ui.phase, ui.name, ui.time, ui.next),
    h('footer', null, ui.skip, ui.pause));
  document.body.append(root);
  document.body.classList.add('playing');

  // --- engine ---------------------------------------------------------------
  const engine = createEngine(segments, {
    segment(seg) {
      const work = seg.kind === 'work';
      root.dataset.kind = seg.kind;
      ui.emoji.textContent = seg.exercise.emoji;
      ui.name.textContent = seg.exercise.name;
      ui.phase.textContent = work ? 'Go!' : seg.index === 0 ? 'Get ready' : 'Next up';
      ui.count.textContent = `Exercise ${seg.index + 1} of ${total}`;
      const after = work && segments.find((s) => s.kind === 'work' && s.index === seg.index + 1);
      ui.next.textContent = !work
        ? `${clock(segments.find((s) => s.kind === 'work' && s.index === seg.index).seconds)} of work`
        : after ? `Then: ${after.exercise.name}` : 'Last one!';
      ui.skip.textContent = work ? 'Done early' : 'Skip wait';
      [...ui.dots.children].forEach((li, n) => {
        if (n > seg.index || (n === seg.index && !work)) li.firstChild.style.transform = 'scaleX(0)';
        if (n < seg.index) li.firstChild.style.transform = 'scaleX(1)';
      });
      if (work) play('go');
      else say(`${seg.index === 0 ? 'Get ready' : 'Next'}: ${seg.exercise.name}`);
      draw();
    },
    end(seg) { if (seg.kind === 'work') play('done'); },
    beep() { play('tick'); },
    gap() { showPaused(); },
    finish() { finish(); },
  });

  function draw() {
    const seg = engine.segment;
    ui.time.textContent = clock(Math.ceil(engine.leftMs / 1000));
    ui.fill.style.transform = `scaleY(${1 - engine.progress})`;
    if (seg.kind === 'work') {
      ui.dots.children[seg.index].firstChild.style.transform = `scaleX(${engine.progress})`;
    }
  }

  function step() {
    if (engine.state !== 'running') return;
    engine.tick(performance.now());
    if (engine.state === 'running' || engine.state === 'paused') draw();
  }
  // A timer (not only animation frames) keeps sounds exact if frames stall.
  const timer = setInterval(step, 100);

  function showPaused() {
    const paused = engine.state === 'paused';
    root.classList.toggle('paused', paused);
    ui.pause.textContent = paused ? 'Resume' : 'Pause';
  }

  function togglePause() {
    const now = performance.now();
    if (engine.state === 'paused') {
      resumeSound();
      engine.resume(now);
      lockScreen();
    } else {
      engine.pause(now);
      hush();
    }
    showPaused();
  }

  // --- keep the screen on; pause when the app goes to the background ---------
  let wakeLock = null;
  async function lockScreen() {
    try {
      const lock = await navigator.wakeLock?.request('screen');
      if (!lock) return;
      if (active !== handle || engine.state === 'done') lock.release();
      else wakeLock = lock;
    } catch { /* low battery or unsupported */ }
  }
  function onVisibility() {
    if (document.hidden) {
      engine.pause(performance.now());
      hush();
      if (engine.state === 'paused') showPaused();
    } else {
      resumeSound();
      if (engine.state !== 'done') lockScreen();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  // --- leaving ----------------------------------------------------------------
  let asking = false;
  async function quit() {
    if (asking) return;
    if (engine.state === 'done') { exit(); return; }
    asking = true;
    const wasRunning = engine.state === 'running';
    engine.pause(performance.now());
    showPaused();
    const yes = engine.state === 'done' ? false : await confirmDialog(
      'Stop this workout?', 'This session won’t be saved to your history.',
      'Stop', { danger: true, no: 'Keep going' });
    asking = false;
    if (yes) exit();
    else if (wasRunning && engine.state === 'paused') togglePause();
  }

  function stopTimers() {
    clearInterval(timer);
    wakeLock?.release().catch(() => {});
    document.removeEventListener('visibilitychange', onVisibility);
  }

  function exit() {
    stopTimers();
    hush();
    releaseSound();
    root.remove();
    document.body.classList.remove('playing');
    active = null;
    onExit();
  }

  function finish() {
    stopTimers();
    const steps = engine.results();
    const activeSeconds = steps.reduce((n, s) => n + s.seconds, 0);
    const plannedSeconds = steps.reduce((n, s) => n + s.planned, 0);
    if (activeSeconds < plannedSeconds * MIN_COMPLETION) {
      showSummary('Too short to count', '🫥', [
        h('p', null, `You did ${clock(activeSeconds)} of ${clock(plannedSeconds)}. A session counts from half-way.`),
      ]);
      return;
    }
    const endedAt = new Date();
    const session = {
      id: uid(),
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      day: dayKey(endedAt),
      hour: endedAt.getHours(),
      goal: settings.dailyGoal,
      plannedSeconds,
      activeSeconds,
      steps,
    };
    const saved = store.update((d) => { d.sessions.push(session); });
    play('finish');
    say('Workout complete. Well done!');
    const game = replay(store.state.sessions);
    const gain = game.bySession.get(session.id);
    const left = Math.max(0, settings.dailyGoal - game.todayDone);
    const line = (label, xp) => xp > 0 && h('li', null, h('span', null, label), h('b', null, `+${xp} XP`));
    if (gain.hitGoal || gain.levelUp || gain.unlocked.length) celebrate();
    showSummary(gain.hitGoal ? 'Daily goal done!' : 'Session complete!', gain.hitGoal ? '🎯' : '🎉', [
      !saved && h('p', { class: 'warn' }, 'Your phone refused to save this session. Free up storage or leave private mode.'),
      h('p', null, left
        ? `${left} more ${left === 1 ? 'session' : 'sessions'} to reach today’s goal.`
        : `${game.todayDone} of ${settings.dailyGoal} sessions today.${game.streak > 1 ? ` ${game.streak}-day streak!` : ''}`),
      h('ul', { class: 'xp-list' },
        line(`${clock(activeSeconds)} of exercise`, gain.time),
        line('Session finished', gain.session),
        line('Daily goal', gain.goal),
        line(`${gain.streakDays}-day streak`, gain.streak),
        h('li', { class: 'total' }, h('span', null, 'Total'), h('b', null, `+${gain.total} XP`))),
      gain.levelUp && h('p', { class: 'unlock' }, '⬆️ ', h('b', null, `Level ${game.level.level}: ${game.level.title}`)),
      gain.unlocked.map((b) => h('p', { class: 'unlock' }, `${b.emoji} `, h('b', null, b.name), ` — ${b.desc}`)),
    ]);
  }

  function showSummary(title, emoji, content) {
    root.dataset.kind = 'summary';
    root.classList.remove('paused');
    const doneBtn = h('button', { class: 'p-btn main', type: 'button', onClick: exit }, 'Done');
    root.replaceChildren(
      h('div', { class: 'p-body summary' },
        h('div', { class: 'p-emoji', 'aria-hidden': 'true' }, emoji),
        h('h1', { class: 'p-name' }, title),
        ...content.flat().filter(Boolean)),
      h('footer', null, doneBtn));
    doneBtn.focus();
  }

  const handle = { quit };
  active = handle;
  lockScreen();
  engine.start(performance.now());
  if (document.hidden) onVisibility();
  ui.pause.focus({ preventScroll: true });
}
