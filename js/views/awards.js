import { h } from '../dom.js';
import { BADGES, XP } from '../game.js';
import { formatDay } from '../dates.js';

export function awardsView({ game }) {
  const { level, badges, totals } = game;
  return [
    h('header', { class: 'top' }, h('h1', null, 'Awards')),
    h('section', { class: 'card level-card' },
      h('p', { class: 'muted' }, `Level ${level.level}`),
      h('p', { class: 'level-title' }, level.title),
      h('div', { class: 'bar big' }, h('i', { style: { width: `${(level.into / level.span) * 100}%` } })),
      h('div', { class: 'level-row muted' },
        h('span', null, `${level.xp.toLocaleString('en')} XP total`),
        h('span', null, `${level.toNext} XP to level ${level.level + 1}`))),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Badges'), h('span', { class: 'muted' }, `${badges.size} of ${BADGES.length}`)),
      h('ul', { class: 'badges' }, BADGES.map((b) => {
        const day = badges.get(b.id);
        const value = Math.min(b.target, b.value(totals));
        return h('li', { class: day ? 'got' : '' },
          h('span', { class: 'badge-emoji', 'aria-hidden': 'true' }, b.emoji),
          h('b', null, b.name),
          h('small', null, b.desc),
          day
            ? h('small', { class: 'when' }, `✓ ${formatDay(day, { day: 'numeric', month: 'short', year: 'numeric' })}`)
            : h('small', { class: 'when' }, `${value} / ${b.target}`));
      }))),
    h('section', { class: 'card' },
      h('h2', null, 'How XP works'),
      h('ul', { class: 'xp-list' },
        [['Each minute of exercise', XP.perMinute], ['Finishing a session', XP.sessionBonus], ['Reaching the daily goal', XP.goalBonus],
          [`Streak, per day (up to ${XP.streakCapDays})`, XP.streakPerDay]]
          .map(([t, x]) => h('li', null, h('span', null, t), h('b', null, `+${x} XP`))))),
  ];
}
