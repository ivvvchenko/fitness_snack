import { confirmDialog, h, openDialog, toast } from '../dom.js';
import { clock, minutesLabel } from '../dates.js';
import { LIMITS, uid } from '../model.js';

const EMOJI = ['🏃', '🔥', '🪵', '💪', '🦵', '🧗', '🐸', '🤸', '🧘', '🦘', '🚴', '🥊', '🕺', '🦀', '🐻', '⭐', '🏋️', '🪜'];

/** Create (no exercise passed) or edit an exercise. */
function exerciseForm(exercise, taken) {
  return openDialog(exercise ? 'Edit exercise' : 'New exercise', (close) => {
    let emoji = exercise?.emoji ?? '⭐';
    const choices = EMOJI.includes(emoji) ? EMOJI : [emoji, ...EMOJI];
    const name = h('input', {
      type: 'text', id: 'ex-name', maxlength: LIMITS.nameLength, required: true, autocomplete: 'off',
      placeholder: 'e.g. Burpees', value: exercise?.name ?? '',
    });
    const error = h('p', { class: 'field-error', role: 'alert' });
    const addToWorkout = h('input', { type: 'checkbox', checked: true });
    const buttons = choices.map((e) => h('button', {
      type: 'button', 'aria-label': `Icon ${e}`, 'aria-pressed': String(e === emoji),
      onClick: () => {
        emoji = e;
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(choices[i] === e)));
      },
    }, e));
    return h('form', {
      novalidate: true,
      onSubmit: (ev) => {
        ev.preventDefault();
        const value = name.value.trim();
        if (!value) error.textContent = 'Enter a name.';
        else if (taken.some((t) => t.toLowerCase() === value.toLowerCase())) error.textContent = 'You already have an exercise with this name.';
        else { close({ name: value, emoji, addToWorkout: !exercise && addToWorkout.checked }); return; }
        name.focus();
      },
    },
    h('label', { for: 'ex-name' }, 'Name'), name, error,
    h('p', { class: 'label' }, 'Icon'),
    h('div', { class: 'emoji-grid' }, buttons),
    !exercise && h('label', { class: 'check' }, addToWorkout, 'Add to my workout (1 min)'),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn', type: 'button', onClick: () => close() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'submit' }, 'Save')));
  });
}

function pickExercise(title, exercises) {
  return openDialog(title, (close) => [
    exercises.length
      ? h('ul', { class: 'pick' }, exercises.map((e) => h('li', null,
        h('button', { type: 'button', onClick: () => close(e.id) }, h('span', { 'aria-hidden': 'true' }, e.emoji), ` ${e.name}`))))
      : h('p', { class: 'muted' }, 'All your exercises are already here.'),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn', type: 'button', onClick: () => close() }, 'Cancel'),
      h('button', { class: 'btn primary', type: 'button', onClick: () => close('new') }, 'New exercise')),
  ]);
}

export function workoutView({ store }) {
  const { workout, exercises } = store.state;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const total = workout.steps.reduce((n, s) => n + s.seconds, 0);
  const editStep = (id, fn) => store.update((d) => fn(d.workout.steps.find((s) => s.id === id)));
  const names = (except) => exercises.filter((e) => e.id !== except).map((e) => e.name);

  async function createExercise(allowAdd) {
    const data = await exerciseForm(null, names());
    if (!data) return null;
    const id = uid();
    store.update((d) => {
      d.exercises.push({ id, name: data.name, emoji: data.emoji });
      if (allowAdd && data.addToWorkout) d.workout.steps.push({ id: uid(), seconds: 60, options: [id], chosen: id });
    });
    return id;
  }

  async function addStep() {
    const id = await pickExercise('Add to workout', exercises);
    if (id === 'new') { createExercise(true); return; }
    if (id) store.update((d) => { d.workout.steps.push({ id: uid(), seconds: 60, options: [id], chosen: id }); });
  }

  async function addAlternative(step) {
    let id = await pickExercise('Add an alternative', exercises.filter((e) => !step.options.includes(e.id)));
    if (id === 'new') id = await createExercise(false);
    if (id) editStep(step.id, (s) => s.options.push(id));
  }

  function removeStep(step) {
    const index = workout.steps.indexOf(step);
    store.update((d) => { d.workout.steps.splice(index, 1); });
    toast('Step removed', { label: 'Undo', run: () => store.update((d) => { d.workout.steps.splice(index, 0, step); }) });
  }

  const move = (index, by) => store.update((d) => {
    const [s] = d.workout.steps.splice(index, 1);
    d.workout.steps.splice(index + by, 0, s);
  });

  async function editExercise(e) {
    const data = await exerciseForm(e, names(e.id));
    if (data) store.update((d) => Object.assign(d.exercises.find((x) => x.id === e.id), { name: data.name, emoji: data.emoji }));
  }

  async function deleteExercise(e) {
    const used = workout.steps.some((s) => s.options.includes(e.id));
    const ok = await confirmDialog(`Delete ${e.name}?`,
      used ? 'It will also be removed from your workout. Past sessions keep it.' : 'Past sessions keep it.',
      'Delete', { danger: true });
    if (ok) store.update((d) => { d.exercises = d.exercises.filter((x) => x.id !== e.id); });
  }

  const [minS, maxS] = LIMITS.stepSeconds;
  const stepCard = (s, i) => {
    const label = s.options.map((id) => byId.get(id).name).join(' or ');
    return h('li', { class: 'step' },
      h('div', { class: 'step-main' },
        h('div', { class: 'chips' }, s.options.flatMap((id, n) => [
          n > 0 && h('span', { class: 'or' }, 'or'),
          h('span', { class: 'chip' }, h('span', { 'aria-hidden': 'true' }, byId.get(id).emoji), ` ${byId.get(id).name}`,
            s.options.length > 1 && h('button', {
              type: 'button', 'aria-label': `Remove ${byId.get(id).name} from this step`,
              onClick: () => editStep(s.id, (x) => { x.options = x.options.filter((o) => o !== id); }),
            }, '×')),
        ]),
        h('button', { class: 'chip add', type: 'button', dataset: { key: `alt-${s.id}` }, onClick: () => addAlternative(s) }, '+ or…')),
        h('div', { class: 'step-tools' },
          h('div', { class: 'stepper', role: 'group', 'aria-label': `Duration of ${label}` },
            h('button', { type: 'button', 'aria-label': '15 seconds less', dataset: { key: `less-${s.id}` }, disabled: s.seconds <= minS, onClick: () => editStep(s.id, (x) => { x.seconds = Math.max(minS, x.seconds - 15); }) }, '−'),
            h('output', null, clock(s.seconds)),
            h('button', { type: 'button', 'aria-label': '15 seconds more', dataset: { key: `more-${s.id}` }, disabled: s.seconds >= maxS, onClick: () => editStep(s.id, (x) => { x.seconds = Math.min(maxS, x.seconds + 15); }) }, '+')),
          h('div', { class: 'step-btns' },
            h('button', { type: 'button', 'aria-label': `Move ${label} up`, dataset: { key: `up-${s.id}` }, disabled: i === 0, onClick: () => move(i, -1) }, '↑'),
            h('button', { type: 'button', 'aria-label': `Move ${label} down`, dataset: { key: `down-${s.id}` }, disabled: i === workout.steps.length - 1, onClick: () => move(i, 1) }, '↓'),
            h('button', { type: 'button', 'aria-label': `Remove ${label}`, onClick: () => removeStep(s) }, '🗑')))));
  };

  return [
    h('header', { class: 'top' }, h('h1', null, 'Workout')),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Session plan'), h('span', { class: 'muted' }, workout.steps.length ? minutesLabel(total) : '')),
      workout.steps.length
        ? h('ol', { class: 'steps' }, workout.steps.map(stepCard))
        : h('p', { class: 'muted' }, 'Nothing here yet. Add your first exercise.'),
      h('button', { class: 'btn primary wide', type: 'button', dataset: { key: 'add-step' }, onClick: addStep }, 'Add exercise to plan')),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Exercise library'), h('span', { class: 'muted' }, String(exercises.length))),
      h('ul', { class: 'library' }, exercises.map((e) => h('li', null,
        h('span', null, h('span', { 'aria-hidden': 'true' }, e.emoji), ` ${e.name}`),
        h('span', { class: 'step-btns' },
          h('button', { type: 'button', 'aria-label': `Edit ${e.name}`, dataset: { key: `edit-${e.id}` }, onClick: () => editExercise(e) }, '✏️'),
          h('button', { type: 'button', 'aria-label': `Delete ${e.name}`, onClick: () => deleteExercise(e) }, '🗑'))))),
      h('button', { class: 'btn wide', type: 'button', dataset: { key: 'new-ex' }, onClick: () => createExercise(true) }, 'New exercise')),
  ];
}
