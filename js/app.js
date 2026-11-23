import { createStore } from './store.js';
import { replay } from './game.js';
import { toast } from './dom.js';
import { configureSound } from './sound.js';
import { isPlaying, requestQuit } from './player.js';
import { todayView } from './views/today.js';
import { progressView } from './views/progress.js';
import { workoutView } from './views/workout.js';
import { awardsView } from './views/awards.js';
import { settingsView } from './views/settings.js';

const noStorage = { getItem: () => null, setItem: () => { throw new Error('blocked'); } };
function safeStorage() {
  try { return window.localStorage ?? noStorage; } catch { return noStorage; }
}

const store = createStore(safeStorage());
const main = document.getElementById('main');
const routes = {
  '#/': todayView,
  '#/progress': progressView,
  '#/workout': workoutView,
  '#/awards': awardsView,
  '#/settings': settingsView,
};
const current = () => (routes[location.hash] ? location.hash : '#/');

function render() {
  configureSound(store.state.settings);
  const key = document.activeElement?.dataset?.key;
  const view = routes[current()];
  const game = replay(store.state.sessions);
  main.replaceChildren(...view({ store, game, refresh: render }).filter(Boolean));
  // Keep keyboard / screen-reader focus on the control that was just used.
  if (key) main.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.getAttribute('href') === current()) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', () => {
  if (isPlaying()) {
    // Back gesture during a workout: stay, and ask first.
    if (location.hash !== '#/play') {
      history.pushState(null, '', '#/play');
      requestQuit();
    }
    return;
  }
  if (location.hash === '#/play') { location.replace('#/'); return; }
  render();
  window.scrollTo(0, 0);
});

store.subscribe(() => {
  if (!store.writable) toast('Could not save. Is private mode on?');
  render();
});
window.addEventListener('storage', () => store.reload());
// A new day may have started while the app was in the background.
document.addEventListener('visibilitychange', () => { if (!document.hidden && !isPlaying()) render(); });

if (location.hash === '#/play') history.replaceState(null, '', '#/');
render();

// Ask the browser not to clear our data when space runs low.
navigator.storage?.persist?.().catch(() => {});

// Offline support. Skipped on localhost unless ?sw is present, so edits show at once.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && (!local || new URLSearchParams(location.search).has('sw'))) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => toast('A new version is ready', {
      label: 'Update',
      sticky: true,
      run: () => {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        worker.postMessage('skip-waiting');
      },
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => { /* app still works online */ });
}
