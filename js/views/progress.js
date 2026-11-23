import { confirmDialog, h, toast } from '../dom.js';
import { clock, dayKey, formatDay, minutesLabel, parseDay, relativeDay, weekday } from '../dates.js';
import { byExercise, calendar, historyGroups, lastDays, weekSummary } from '../stats.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const describe = (d) => `${formatDay(d.day)}: ${d.count ? `${plural(d.count, 'session')}, ${minutesLabel(d.seconds)}` : 'no sessions'}`;
let shownHistory = 10;

/** Columns with a one-line readout that follows tap, hover or keyboard focus. */
function dailyChart(sessions, goal) {
  const days = lastDays(sessions, 14);
  const max = Math.max(goal, ...days.map((d) => d.count), 2);
  const readout = h('p', { class: 'readout' }, describe(days.at(-1)));
  const columns = days.map((d) => {
    const show = () => {
      readout.textContent = describe(d);
      columns.forEach((c) => c.classList.toggle('on', c === col));
    };
    const col = h('button', {
      type: 'button', class: 'col', 'aria-label': describe(d),
      onClick: show, onPointerenter: show, onFocus: show,
    }, h('i', { style: { height: `${(d.count / max) * 100}%` } }));
    return col;
  });
  columns.at(-1).classList.add('on');
  return h('section', { class: 'card' },
    h('h2', null, 'Sessions per day'),
    readout,
    h('div', { class: 'chart' },
      h('div', { class: 'goal-line', style: { bottom: `${(goal / max) * 100}%` } }, h('span', null, `Goal ${goal}`)),
      h('div', { class: 'cols' }, columns)),
    h('div', { class: 'axis', 'aria-hidden': 'true' },
      days.map((d, i) => h('span', { class: i === 13 ? 'now' : '' }, String(parseDay(d.day).getDate())))));
}

function calendarCard(sessions) {
  const weeks = calendar(sessions, 12);
  const readout = h('p', { class: 'readout' }, 'Last 12 weeks');
  const cells = weeks.flat().map((d) => {
    if (d.future) return h('span', { class: 'cell future' });
    const show = () => { readout.textContent = describe(d); };
    return h('button', {
      type: 'button', class: 'cell', dataset: { n: String(Math.min(3, d.count)) }, 'aria-label': describe(d),
      tabindex: d.day === dayKey() ? '0' : '-1', onClick: show, onPointerenter: show, onFocus: show,
    });
  });
  return h('section', { class: 'card' },
    h('h2', null, 'Consistency'),
    readout,
    h('div', { class: 'cal' },
      h('div', { class: 'cal-days', 'aria-hidden': 'true' }, ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((t) => h('span', null, t))),
      h('div', { class: 'cal-grid' }, cells)),
    h('p', { class: 'scale' }, 'Sessions: ',
      [0, 1, 2, 3].map((n) => h('span', null, h('i', { class: 'cell', dataset: { n: String(n) } }), n === 3 ? '3+' : String(n)))));
}

function exerciseCard(sessions) {
  const rows = byExercise(sessions);
  if (!rows.length) return null;
  const max = rows[0].seconds;
  return h('section', { class: 'card' },
    h('h2', null, 'Time by exercise'),
    h('ul', { class: 'hbars' }, rows.map((r) => h('li', null,
      h('span', { class: 'hbar-name' }, h('span', { 'aria-hidden': 'true' }, r.emoji), ` ${r.name}`),
      h('span', { class: 'hbar-val' }, clock(r.seconds)),
      h('span', { class: 'hbar-track' }, h('i', { style: { width: `${(r.seconds / max) * 100}%` } }))))));
}

function historyCard({ store, game, refresh }) {
  const all = historyGroups(store.state.sessions);
  const groups = all.slice(0, shownHistory);

  async function remove(x) {
    const ok = await confirmDialog('Delete this session?', 'Its time and XP will be removed, and streaks or badges that depend on it may change.', 'Delete', { danger: true });
    if (!ok) return;
    store.update((d) => { d.sessions = d.sessions.filter((s) => s.id !== x.id); });
    toast('Session deleted', { label: 'Undo', run: () => store.update((d) => { d.sessions.push(x); }) });
  }

  return h('section', { class: 'card' },
    h('h2', null, 'History'),
    groups.length === 0 && h('p', { class: 'muted' }, 'Your finished sessions will appear here.'),
    groups.map((g) => h('div', { class: 'day' },
      h('h3', null, relativeDay(g.day), game.metDays.has(g.day) && h('span', { class: 'met' }, '✓ goal')),
      g.items.map((x) => h('details', null,
        h('summary', null,
          h('span', null, new Date(x.endedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })),
          h('span', { class: 'sum-emoji', 'aria-hidden': 'true' }, x.steps.filter((s) => s.seconds).map((s) => s.emoji).join(' ')),
          h('b', null, `+${game.bySession.get(x.id).total} XP`)),
        h('ul', { class: 'steps-done' }, x.steps.map((s) => h('li', null,
          h('span', null, `${s.emoji} ${s.name}`),
          h('span', { class: 'muted' }, s.seconds < s.planned ? `${clock(s.seconds)} of ${clock(s.planned)}` : clock(s.seconds))))),
        h('button', { class: 'link danger-text', type: 'button', onClick: () => remove(x) }, 'Delete session'))))),
    all.length > groups.length && h('button', {
      class: 'btn wide', type: 'button', onClick: () => { shownHistory += 20; refresh(); },
    }, 'Show older'));
}

export function progressView(ctx) {
  const { store, game } = ctx;
  const { sessions, settings } = store.state;
  const week = weekSummary(sessions);
  const today = dayKey();
  const weekTarget = settings.dailyGoal * (weekday(today) + 1);
  const tile = (label, value, note) => h('div', { class: 'tile' },
    h('span', null, label), h('b', null, value), note && h('small', null, note));

  return [
    h('header', { class: 'top' }, h('h1', null, 'Progress')),
    h('section', { class: 'tiles', 'aria-label': 'Summary' },
      tile('This week', plural(week.sessions, 'session'), `target so far: ${weekTarget}`),
      tile('Last week', plural(week.prevSessions, 'session')),
      tile('Current streak', plural(game.streak, 'day'), `best: ${game.bestStreak}`),
      tile('Total time', minutesLabel(game.totals.seconds), `${plural(game.totals.sessions, 'session')}`)),
    dailyChart(sessions, settings.dailyGoal),
    calendarCard(sessions),
    exerciseCard(sessions),
    historyCard(ctx),
  ];
}
