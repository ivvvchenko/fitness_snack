import { h, ring } from '../dom.js';
import { clock, minutesLabel } from '../dates.js';
import { startWorkout } from '../player.js';

const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function todayView({ store, game }) {
  const { workout, exercises, settings } = store.state;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const goal = settings.dailyGoal;
  const left = Math.max(0, goal - game.todayDone);
  const total = workout.steps.reduce((n, s) => n + s.seconds, 0);

  const message = left === 0
    ? 'Goal reached. Anything more is dessert.'
    : game.todayDone === 0
      ? `${goal} short ${goal === 1 ? 'session' : 'sessions'} on today’s menu.`
      : `${left} more to hit today’s goal.`;

  const choose = (stepId, exerciseId) => store.update((d) => {
    d.workout.steps.find((s) => s.id === stepId).chosen = exerciseId;
  });

  return [
    h('header', { class: 'top' },
      h('h1', null, 'Fitness Snack'),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, '⚙️')),

    h('section', { class: 'card hero' },
      h('div', { class: 'ring-wrap' },
        ring(game.todayDone / goal, `${game.todayDone} of ${goal} sessions today`),
        h('div', { class: 'ring-text', 'aria-hidden': 'true' },
          h('b', null, String(game.todayDone)), h('span', null, `of ${goal}`))),
      h('div', { class: 'hero-side' },
        h('p', { class: 'streak' }, h('span', { 'aria-hidden': 'true' }, game.streak ? '🔥' : '🌱'),
          h('b', null, `${game.streak}`), '-day streak'),
        h('p', { class: 'muted' }, message))),

    h('a', { class: 'card level', href: '#/awards' },
      h('div', { class: 'level-row' },
        h('b', null, `Level ${game.level.level} · ${game.level.title}`),
        h('span', { class: 'muted' }, `${game.level.toNext} XP to next`)),
      h('div', { class: 'bar' }, h('i', { style: { width: `${(game.level.into / game.level.span) * 100}%` } }))),

    h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', null, 'Your session'),
        h('span', { class: 'muted' }, workout.steps.length ? minutesLabel(total) : '')),
      workout.steps.length
        ? h('ol', { class: 'plan' }, workout.steps.map((s) => h('li', null,
          s.options.length > 1
            ? h('div', { class: 'choice', role: 'radiogroup', 'aria-label': 'Choose exercise' },
              s.options.map((id) => h('button', {
                type: 'button', role: 'radio', 'aria-checked': String(s.chosen === id),
                dataset: { key: `choose-${s.id}-${id}` }, onClick: () => choose(s.id, id),
              }, h('span', { 'aria-hidden': 'true' }, byId.get(id).emoji), ` ${byId.get(id).name}`)))
            : h('span', { class: 'plan-name' }, h('span', { 'aria-hidden': 'true' }, byId.get(s.chosen).emoji), ` ${byId.get(s.chosen).name}`),
          h('span', { class: 'time' }, clock(s.seconds)))))
        : h('p', { class: 'muted' }, 'Your workout is empty. ', h('a', { href: '#/workout' }, 'Add exercises'))),

    h('div', { class: 'start-wrap' },
      h('button', {
        class: 'btn start', type: 'button', disabled: workout.steps.length === 0,
        onClick: () => {
          location.hash = '#/play';
          startWorkout(store, () => location.replace('#/'));
        },
      }, 'Start session')),

    !isInstalled() && h('p', { class: 'tip' },
      '📲 Add this app to your Home Screen. It opens full screen, works offline, and keeps your history safer.'),
  ];
}
