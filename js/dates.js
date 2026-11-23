// Calendar days are stored as local "YYYY-MM-DD" strings, so a session keeps
// its day even if the phone later changes time zone.

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Whole calendar days from a to b (DST-safe: compared in UTC). */
export function dayDiff(a, b) {
  const utc = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** 0 = Monday … 6 = Sunday */
export const weekday = (key) => (parseDay(key).getDay() + 6) % 7;

export const startOfWeek = (key) => addDays(key, -weekday(key));

export function formatDay(key, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parseDay(key).toLocaleDateString('en-GB', opts);
}

export function relativeDay(key, today = dayKey()) {
  const diff = dayDiff(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return formatDay(key, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

export function clock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function minutesLabel(totalSeconds) {
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${rest} min` : `${Math.floor(m / 60)} h`;
}
