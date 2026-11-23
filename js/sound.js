// All sounds are synthesised, so there are no audio files to load or cache.

let ctx = null;
let settings = { sound: true, vibrate: true, voice: false, playInSilentMode: true };

export function configureSound(next) {
  settings = next;
}

/** Must be called from a tap: phones only allow audio after a user gesture. */
export function unlockSound() {
  const AC = window.AudioContext ?? window.webkitAudioContext;
  if (!AC || !settings.sound) return;
  // iPhone: "playback" keeps sounds audible when the ring switch is on silent.
  if (navigator.audioSession) {
    try { navigator.audioSession.type = settings.playInSilentMode ? 'playback' : 'auto'; } catch { /* unsupported type */ }
  }
  ctx ??= new AC();
  resumeSound();
}

/** iOS suspends audio after calls, alarms or app switches. */
export function resumeSound() {
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
}

/** Hand the audio session back so the user's music can continue. */
export function releaseSound() {
  if (ctx?.state === 'running') ctx.suspend().catch(() => {});
  if (navigator.audioSession) {
    try { navigator.audioSession.type = 'auto'; } catch { /* unsupported type */ }
  }
}

function note(freq, at, length, { type = 'sine', gain = 0.5 } = {}) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

const SOUNDS = {
  tick: () => note(660, 0, 0.14, { type: 'triangle', gain: 0.45 }),
  go: () => note(1046, 0, 0.45, { type: 'triangle', gain: 0.7 }),
  done: () => {
    note(784, 0, 0.25, { type: 'triangle', gain: 0.7 });
    note(1046, 0.16, 0.5, { type: 'triangle', gain: 0.7 });
  },
  finish: () => [523, 659, 784, 1046].forEach((f, i) => note(f, i * 0.16, i === 3 ? 0.9 : 0.3, { type: 'triangle', gain: 0.7 })),
};

const BUZZ = { tick: 40, go: 150, done: [120, 60, 120], finish: [150, 80, 150, 80, 350] };

export function play(name) {
  if (settings.vibrate) navigator.vibrate?.(BUZZ[name]);
  if (!settings.sound || !ctx) return;
  resumeSound();
  SOUNDS[name]();
}

export function say(text) {
  if (!settings.voice || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  speechSynthesis.speak(u);
}

export function hush() {
  window.speechSynthesis?.cancel();
}
