/** Timezone-aware date helpers (no external deps). */
const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function partsInTz(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, weekday: p.weekday.toLowerCase() };
}
export const ymd = (p) => `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;

export function addDays(ymdStr, n) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function todayIn(tz, now = new Date()) { return ymd(partsInTz(now, tz)); }

/** Offset like +05:30 for a wall-clock time in tz. */
export function offsetFor(tz, dateStr, timeStr = '12:00') {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`);
  const p = partsInTz(guess, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
  const diffMin = Math.round((asUtc - guess.getTime()) / 60000);
  const sign = diffMin >= 0 ? '+' : '-';
  const a = Math.abs(diffMin);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
export function toRfc3339(dateStr, timeStr, tz) { return `${dateStr}T${timeStr}:00${offsetFor(tz, dateStr, timeStr)}`; }

/** Deterministic resolver for common English/Hinglish relative day words. Returns YYYY-MM-DD or null. */
export function resolveRelativeDate(text, tz, now = new Date()) {
  const t = String(text).toLowerCase();
  const today = todayIn(tz, now);
  if (/\b(day after tomorrow|parso|parsoon)\b/.test(t)) return addDays(today, 2);
  if (/\b(tomorrow|tmrw|tmr|kal)\b/.test(t) && !/\b(yesterday)\b/.test(t)) return addDays(today, 1);
  if (/\b(today|aaj)\b/.test(t)) return today;
  if (/\byesterday\b/.test(t)) return addDays(today, -1);
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/); if (iso) return iso[1];
  const HI = ['ravivar', 'somvar', 'mangalvar', 'budhvar', 'guruvar', 'shukravar', 'shanivar'];
  const cur = WD.indexOf(partsInTz(now, tz).weekday);
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b(${WD[i]}|${WD[i].slice(0, 3)}|${HI[i]})\\b`).test(t)) {
      let delta = (i - cur + 7) % 7;
      if (delta === 0) delta = 7; // same weekday name means the coming one
      return addDays(today, delta);
    }
  }
  return null;
}
export function dateContext(tz, now = new Date()) {
  const today = todayIn(tz, now);
  const p = partsInTz(now, tz);
  const table = Array.from({ length: 8 }, (_, i) => `${addDays(today, i)} (${WD[(WD.indexOf(p.weekday) + i) % 7]})`).join(', ');
  return `Current local date/time: ${today} ${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')} (${p.weekday}), timezone ${tz}. Upcoming dates: ${table}.`;
}
