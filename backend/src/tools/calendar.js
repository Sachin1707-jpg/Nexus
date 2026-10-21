import { z } from 'zod';
import * as C from '../integrations/calendar.js';
import { propose } from '../services/approvals.js';
import { ok, ask, fuzzyMatch, tz } from './helpers.js';
import { addDays } from '../orchestrator/dates.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
async function resolveEvent({ eventId, query, from, to }) {
  if (eventId) return { event: await C.getEvent(eventId) };
  const today = new Date().toISOString().slice(0, 10);
  const evs = await C.listEvents({ from: from ?? addDays(today, -1), to: to ?? addDays(today, 60), tz: tz() });
  const m = query ? fuzzyMatch(evs, query, (e) => e.title) : evs;
  const cand = (m.length ? m : evs).slice(0, 6).map((e) => ({ id: e.id, title: e.title, start: e.start }));
  if (!m.length) return { clarify: ask(query ? `I couldn't find an event matching "${query}". Which one do you mean?` : 'Which event do you mean?', { candidates: cand }) };
  if (m.length > 1) return { clarify: ask('More than one event matches. Which one?', { candidates: cand }) };
  return { event: m[0] };
}
const sel = { eventId: z.string().optional(), query: z.string().optional().describe('Words from the event title'), from: date.optional(), to: date.optional() };

export const calendarTools = [
  { name: 'calendar_list_events', domain: 'calendar', risk: 'read', description: 'List calendar events between from and to (YYYY-MM-DD, inclusive).',
    schema: { from: date, to: date, query: z.string().optional() },
    handler: async (a) => { const e = await C.listEvents({ ...a, tz: tz() }); return ok({ count: e.length, events: e }); } },
  { name: 'calendar_create_event', domain: 'calendar', risk: 'write', description: 'Create a calendar event. Requires title, date, startTime and endTime (24h HH:MM). Ask the user if date or time is missing. Set ignoreConflicts=true only if the user confirmed.',
    schema: { title: z.string().min(1).max(200), date, startTime: time, endTime: time, description: z.string().optional(), location: z.string().optional(), attendees: z.array(z.string().email()).max(20).optional(), ignoreConflicts: z.boolean().default(false) },
    handler: async (a) => {
      if (a.endTime <= a.startTime) return ask('The end time must be after the start time. What time should it end?');
      if (!a.ignoreConflicts) { const c = await C.findConflicts({ ...a, tz: tz() }); if (c.length) return ask(`This overlaps with "${c[0].title}" (${c[0].start}). Schedule it anyway?`, { conflicts: c }); }
      return ok({ created: await C.createEvent({ ...a, tz: tz() }) });
    } },
  { name: 'calendar_update_event', domain: 'calendar', risk: 'write', description: 'Edit or reschedule a calendar event immediately. To reschedule give date, startTime, endTime. Identify the event by eventId or query.',
    schema: { ...sel, title: z.string().optional(), date: date.optional(), startTime: time.optional(), endTime: time.optional(), description: z.string().optional(), location: z.string().optional() },
    handler: async (a) => {
      const r = await resolveEvent(a); if (r.clarify) return r.clarify; const ev = r.event;
      let { date: d, startTime, endTime } = a;
      if (d && !startTime && !ev.allDay) { startTime = ev.start.slice(11, 16); endTime = ev.end.slice(11, 16); }
      if ((startTime && !endTime) || (!startTime && endTime)) return ask('Please give both a start and end time.');
      let conflictWarning = null;
      if (d && startTime) { const c = (await C.findConflicts({ date: d, startTime, endTime, tz: tz(), excludeId: ev.id })); if (c.length) conflictWarning = `Overlaps with "${c[0].title}"`; }
      const payload = { eventId: ev.id, title: a.title, date: d, startTime, endTime, description: a.description, location: a.location, tz: tz() };
      const updated = await C.updateEvent(Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)));
      return ok({ updated, conflictWarning });
    } },
  { name: 'calendar_delete_event', domain: 'calendar', risk: 'write', description: 'Cancel/delete a calendar event immediately.',
    schema: sel,
    handler: async (a) => { const r = await resolveEvent(a); if (r.clarify) return r.clarify; await C.deleteEvent(r.event.id); return ok({ cancelled: r.event.title }); } },
];
