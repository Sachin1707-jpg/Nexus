import { gfetch } from './google.js';
import { toRfc3339 } from '../orchestrator/dates.js';
const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

const shape = (e) => ({
  id: e.id, title: e.summary ?? '(no title)', description: e.description ?? '', location: e.location ?? '',
  start: e.start?.dateTime ?? e.start?.date, end: e.end?.dateTime ?? e.end?.date, allDay: Boolean(e.start?.date),
  status: e.status, link: e.htmlLink, attendees: (e.attendees ?? []).map((a) => a.email),
});

export async function listEvents({ from, to, tz, query, max = 100 }) {
  const timeMin = toRfc3339(from, '00:00', tz); const timeMax = toRfc3339(to, '23:59', tz);
  const out = []; let pageToken;
  do {
    const j = await gfetch(BASE, { query: { timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 250, q: query, pageToken, timeZone: tz } });
    out.push(...(j.items ?? []).filter((e) => e.status !== 'cancelled').map(shape));
    pageToken = j.nextPageToken;
  } while (pageToken && out.length < max);
  return out.slice(0, max);
}
export async function getEvent(id) { return shape(await gfetch(`${BASE}/${id}`)); }
const startEnd = ({ date, startTime, endTime, tz }) => ({
  start: { dateTime: toRfc3339(date, startTime, tz), timeZone: tz },
  end: { dateTime: toRfc3339(date, endTime, tz), timeZone: tz },
});
export async function findConflicts({ date, startTime, endTime, tz, excludeId }) {
  const evs = await listEvents({ from: date, to: date, tz });
  const s = new Date(toRfc3339(date, startTime, tz)).getTime(); const e = new Date(toRfc3339(date, endTime, tz)).getTime();
  return evs.filter((x) => !x.allDay && x.id !== excludeId && new Date(x.start).getTime() < e && new Date(x.end).getTime() > s);
}
export async function createEvent({ title, date, startTime, endTime, tz, description, location, attendees }) {
  const body = { summary: title, description, location, ...startEnd({ date, startTime, endTime, tz }), ...(attendees?.length ? { attendees: attendees.map((email) => ({ email })) } : {}) };
  const e = await gfetch(BASE, { method: 'POST', body });
  const check = await getEvent(e.id);
  if (check.title !== title) throw new Error('Verification failed: event not found as created.');
  return check;
}
export async function updateEvent({ eventId, title, date, startTime, endTime, tz, description, location }) {
  const body = {};
  if (title !== undefined) body.summary = title;
  if (description !== undefined) body.description = description;
  if (location !== undefined) body.location = location;
  if (date && startTime && endTime) Object.assign(body, startEnd({ date, startTime, endTime, tz }));
  await gfetch(`${BASE}/${eventId}`, { method: 'PATCH', body });
  const check = await getEvent(eventId);
  if (date && startTime && !check.start.startsWith(date)) throw new Error('Verification failed: event date did not change.');
  return check;
}
export async function deleteEvent(eventId) {
  await gfetch(`${BASE}/${eventId}`, { method: 'DELETE' });
  try { const e = await getEvent(eventId); if (e.status !== 'cancelled') throw new Error('Verification failed: event still exists.'); } catch (err) { if (err.status !== 404 && err.code !== 'google_not_found') { if (/Verification/.test(err.message)) throw err; } }
  return true;
}
