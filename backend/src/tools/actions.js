import { z } from 'zod';
import { registerAction } from '../services/approvals.js';
import * as tasks from '../integrations/tasks.js';
import * as cal from '../integrations/calendar.js';
import * as gmail from '../integrations/gmail.js';
import * as sys from '../integrations/system.js';
import * as gh from '../integrations/github.js';
import { getSettings } from '../services/settings.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const ACTIONS = {
  'task.delete': {
    schema: z.object({ listId: z.string().min(1), taskIds: z.array(z.string().min(1)).min(1).max(50), titles: z.array(z.string()).max(50) }),
    describe: (p) => ({ title: `Delete ${p.taskIds.length} task${p.taskIds.length > 1 ? 's' : ''}`, lines: p.titles, consequence: 'These tasks will be permanently removed from Google Tasks.' }),
    execute: async (p) => { for (const id of p.taskIds) await tasks.deleteTask({ listId: p.listId, taskId: id }); return { deleted: p.taskIds.length }; },
  },
  'calendar.update': {
    schema: z.object({ eventId: z.string().min(1), currentTitle: z.string(), title: z.string().min(1).optional(), date: date.optional(), startTime: time.optional(), endTime: time.optional(), description: z.string().optional(), location: z.string().optional() }),
    describe: (p) => ({ title: `Change event "${p.currentTitle}"`, lines: [p.title && `New title: ${p.title}`, p.date && `New date: ${p.date}`, p.startTime && `Time: ${p.startTime}–${p.endTime}`, p.location && `Location: ${p.location}`].filter(Boolean), consequence: 'The event in Google Calendar will be modified. Attendees may be notified.' }),
    execute: async (p) => { const { currentTitle, ...rest } = p; return cal.updateEvent({ ...rest, tz: getSettings().timezone }); },
  },
  'calendar.delete': {
    schema: z.object({ eventId: z.string().min(1), title: z.string(), start: z.string() }),
    describe: (p) => ({ title: `Cancel event "${p.title}"`, lines: [`Starts: ${p.start}`], consequence: 'The event will be removed from your Google Calendar.' }),
    execute: async (p) => { await cal.deleteEvent(p.eventId); return { cancelled: p.title }; },
  },
  'email.send': {
    schema: z.object({ to: z.string().refine(gmail.validEmail, 'Invalid recipient address'), cc: z.string().refine((v) => !v || gmail.validEmail(v)).optional(), subject: z.string().min(1).max(300), body: z.string().min(1).max(20000) }),
    describe: (p) => ({ title: `Send email to ${p.to}`, lines: [`To: ${p.to}`, p.cc ? `Cc: ${p.cc}` : null, `Subject: ${p.subject}`, '', p.body].filter((x) => x !== null), consequence: 'This email will be sent from your Gmail account and cannot be unsent.' }),
    execute: (p) => gmail.sendEmail(p),
  },
  'system.delete_files': {
    schema: z.object({ paths: z.array(z.string().min(1)).min(1).max(50) }),
    describe: (p) => ({ title: `Delete ${p.paths.length} file${p.paths.length > 1 ? 's' : ''}`, lines: p.paths, consequence: 'Files are permanently deleted (not sent to the Recycle Bin).' }),
    execute: async (p) => ({ deleted: await sys.deleteFiles(p) }),
  },
  'system.kill_process': {
    schema: z.object({ pid: z.number().int().positive(), name: z.string().min(1) }),
    describe: (p) => ({ title: `Stop process ${p.name} (PID ${p.pid})`, lines: [], consequence: 'The process will be asked to terminate. Unsaved work in that program may be lost.' }),
    execute: async (p) => { await sys.killProcess({ pid: p.pid, expectedName: p.name }); return { stopped: p.name }; },
  },
  'github.open_pr': {
    schema: z.object({ owner: z.string().regex(/^[\w.-]+$/), repo: z.string().regex(/^[\w.-]+$/), baseBranch: z.string().min(1), branch: z.string().regex(/^[\w./-]{3,100}$/), title: z.string().min(3).max(200), body: z.string().max(10000).default(''), commitMessage: z.string().max(300).optional(), changes: z.array(z.object({ path: z.string().min(1).refine((s) => !s.includes('..') && !s.startsWith('/')), content: z.string().max(500000), diff: z.string().optional() })).min(1).max(20) }),
    describe: (p) => ({ title: `Open pull request "${p.title}" on ${p.owner}/${p.repo}`, lines: [`Base: ${p.baseBranch} ← new branch: ${p.branch}`, ...p.changes.map((c) => `Changed: ${c.path}`)], diff: p.changes.map((c) => `--- ${c.path}\n${c.diff ?? '(no diff preview)'}`).join('\n\n'), consequence: 'A new branch is created, files are committed, and a pull request is opened on GitHub.' }),
    execute: (p) => gh.openPullRequest(p),
  },
};
export function registerAllActions() { for (const [t, d] of Object.entries(ACTIONS)) registerAction(t, d); }
