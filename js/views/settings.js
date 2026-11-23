import { confirmDialog, h, toast } from '../dom.js';
import { dayKey } from '../dates.js';
import { LIMITS } from '../model.js';
import { configureSound, play, unlockSound } from '../sound.js';

export function settingsView({ store }) {
  const s = store.state.settings;
  const set = (key, value) => store.update((d) => { d.settings[key] = value; });

  const number = (key, label, step, unit, note) => {
    const [lo, hi] = LIMITS[key];
    return h('div', { class: 'setting' },
      h('div', null, h('b', null, label), note && h('small', null, note)),
      h('div', { class: 'stepper', role: 'group', 'aria-label': label },
        h('button', { type: 'button', 'aria-label': `Decrease ${label}`, dataset: { key: `${key}-less` }, disabled: s[key] <= lo, onClick: () => set(key, s[key] - step) }, '−'),
        h('output', null, `${s[key]}${unit}`),
        h('button', { type: 'button', 'aria-label': `Increase ${label}`, dataset: { key: `${key}-more` }, disabled: s[key] >= hi, onClick: () => set(key, s[key] + step) }, '+')));
  };
  const toggle = (key, label, note) => h('label', { class: 'setting' },
    h('div', null, h('b', null, label), note && h('small', null, note)),
    h('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: s[key], dataset: { key }, onChange: (e) => set(key, e.target.checked) }));

  async function exportFile() {
    const name = `fitness-snack-${dayKey()}.json`;
    const file = new File([store.exportJson()], name, { type: 'application/json' });
    // The share sheet is the reliable way to save a file from an installed app.
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(file);
    h('a', { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const picker = h('input', {
    type: 'file', accept: '.json,application/json', hidden: true,
    onChange: async () => {
      const file = picker.files[0];
      picker.value = '';
      if (!file) return;
      const json = await file.text();
      if (!await confirmDialog('Restore this backup?', 'Your program and settings will be replaced. History is merged, nothing is removed.', 'Restore')) return;
      try {
        const added = store.importJson(json);
        toast(`Backup restored, ${added} new ${added === 1 ? 'session' : 'sessions'}`);
      } catch (e) {
        toast(e.message);
      }
    },
  });

  return [
    h('header', { class: 'top' }, h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Back' }, '←'), h('h1', null, 'Settings')),
    h('section', { class: 'card' },
      h('h2', null, 'Training'),
      number('dailyGoal', 'Sessions per day', 1, '', 'Applies to new sessions'),
      number('restSeconds', 'Pause between exercises', 5, ' s')),
    h('section', { class: 'card' },
      h('h2', null, 'Sound'),
      toggle('sound', 'Sounds'),
      'audioSession' in navigator && toggle('playInSilentMode', 'Play in silent mode', 'May pause your music'),
      'vibrate' in navigator && toggle('vibrate', 'Vibration'),
      'speechSynthesis' in window && toggle('voice', 'Say exercise names'),
      h('button', {
        class: 'btn wide', type: 'button', dataset: { key: 'test-sound' },
        onClick: () => { configureSound(s); unlockSound(); play('done'); },
      }, 'Test sound')),
    h('section', { class: 'card' },
      h('h2', null, 'Your data'),
      h('p', { class: 'muted' }, 'Everything is stored on this phone only. Save a backup now and then.'),
      h('button', { class: 'btn wide', type: 'button', onClick: exportFile }, 'Save backup'),
      h('button', { class: 'btn wide', type: 'button', onClick: () => picker.click() }, 'Restore backup'),
      picker,
      h('button', {
        class: 'btn wide', type: 'button',
        onClick: async () => {
          if (await confirmDialog('Reset the program?', 'The four original exercises come back. Your own exercises and history stay.', 'Reset')) {
            store.resetProgram();
            toast('Program reset');
          }
        },
      }, 'Reset program'),
      h('button', {
        class: 'btn wide danger-text', type: 'button',
        onClick: async () => {
          if (await confirmDialog('Erase everything?', 'History, XP, badges and your exercises will be deleted. This cannot be undone.', 'Erase', { danger: true })) {
            store.eraseAll();
            toast('All data erased');
          }
        },
      }, 'Erase all data')),
  ];
}
