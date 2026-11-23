// Tiny DOM helper. Text is always set as text nodes, so user input (exercise
// names, imported backups) can never inject markup.

function setProps(el, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'style') for (const [k, v] of Object.entries(value)) el.style.setProperty(k, v);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'value' || key === 'checked') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  setProps(el, props);
  el.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

export function ring(fraction, label) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const circle = (cls, dash) => {
    const c = document.createElementNS(ns, 'circle');
    for (const [k, v] of Object.entries({ cx: 60, cy: 60, r: 52, class: cls, pathLength: 100 })) c.setAttribute(k, v);
    if (dash !== undefined) c.setAttribute('stroke-dasharray', `${dash} 100`);
    svg.append(c);
  };
  circle('ring-track');
  if (fraction > 0) circle('ring-value', Math.min(1, fraction) * 100);
  return svg;
}

let toastTimer;
export function toast(message, action) {
  const box = document.getElementById('toast');
  clearTimeout(toastTimer);
  box.replaceChildren(h('span', null, message));
  if (action) {
    box.append(h('button', { type: 'button', onClick: () => { box.hidden = true; action.run(); } }, action.label));
  }
  box.hidden = false;
  if (!action?.sticky) toastTimer = setTimeout(() => { box.hidden = true; }, action ? 6000 : 3000);
}

/** Opens a modal <dialog>; build(close) returns its content. Resolves with close(value). */
export function openDialog(title, build) {
  return new Promise((resolve) => {
    const id = `dlg-${Date.now()}`;
    const dlg = h('dialog', { class: 'sheet', 'aria-labelledby': id });
    // Settled here rather than in the "close" event, which waits for a frame.
    const close = (value) => {
      if (dlg.open) dlg.close();
      dlg.remove();
      resolve(value);
    };
    dlg.append(h('h2', { id }, title), ...[build(close)].flat());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('close', () => close());
    document.body.append(dlg);
    dlg.showModal();
  });
}

export const confirmDialog = (title, body, yes, { danger = false, no = 'Cancel' } = {}) =>
  openDialog(title, (close) => [
    h('p', null, body),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn', type: 'button', onClick: () => close(false) }, no),
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onClick: () => close(true) }, yes)),
  ]).then(Boolean);

export function celebrate() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#ffb31a', '#1c8a52', '#f25c3d', '#3a8fd6'];
  const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' },
    Array.from({ length: 60 }, (_, i) => h('i', {
      style: {
        left: `${Math.random() * 100}%`,
        background: colors[i % colors.length],
        'animation-delay': `${Math.random() * 0.6}s`,
        'animation-duration': `${1.8 + Math.random() * 1.4}s`,
        '--drift': `${(Math.random() - 0.5) * 200}px`,
        '--spin': `${360 + Math.random() * 720}deg`,
      },
    })));
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4200);
}
