import { z } from 'zod';
import * as T from '../integrations/tasks.js';
import { propose } from '../services/approvals.js';
import { ok, ask, fuzzyMatch } from './helpers.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
async function resolveTask({ taskId, listId, query }) {
  if (taskId && listId) return { task: await T.getTask(listId, taskId) };
  const all = await T.listTasks({ status: 'pending' });
  if (taskId) { const t = all.find((x) => x.id === taskId); if (t) return { task: t }; }
  if (!query) return { clarify: ask('Which task do you mean?', { candidates: all.slice(0, 8).map((t) => ({ id: t.id, title: t.title, due: t.due })) }) };
  const m = fuzzyMatch(all, query, (t) => t.title);
  if (!m.length) return { clarify: ask(`I couldn't find a pending task matching "${query}". Which one do you mean?`, { candidates: all.slice(0, 8).map((t) => ({ id: t.id, title: t.title, due: t.due })) }) };
  if (m.length > 1 && m[0].title.toLowerCase() !== query.toLowerCase()) return { clarify: ask(`Several tasks match "${query}". Which one?`, { candidates: m.slice(0, 6).map((t) => ({ id: t.id, title: t.title, due: t.due })) }) };
  return { task: m[0] };
}
const pick = { taskId: z.string().optional().describe('Exact task id if known'), listId: z.string().optional(), query: z.string().optional().describe('Words from the task title to find it') };

export const taskTools = [
  { name: 'tasks_list', domain: 'tasks', risk: 'read', description: 'List Google Tasks. status: pending, completed or all. Optional dueOn / dueBefore (YYYY-MM-DD).',
    schema: { status: z.enum(['pending', 'completed', 'all']).default('pending'), dueOn: date.optional(), dueBefore: date.optional() },
    handler: async (a) => { const t = await T.listTasks(a); return ok({ count: t.length, tasks: t.slice(0, 100) }); } },
  { name: 'tasks_create', domain: 'tasks', risk: 'write', description: 'Create a task immediately in Google Tasks. due is YYYY-MM-DD resolved from the date table.',
    schema: { title: z.string().min(1).max(300), notes: z.string().max(2000).optional(), due: date.optional(), allowDuplicate: z.boolean().default(true) },
    handler: async (a) => {
      return ok({ created: await T.createTask(a) });
    } },
  { name: 'tasks_update', domain: 'tasks', risk: 'write', description: 'Edit a task title, notes or due date, or mark it completed/pending (status). Identify it by taskId or query.',
    schema: { ...pick, title: z.string().max(300).optional(), notes: z.string().max(2000).optional(), due: date.nullable().optional(), status: z.enum(['completed', 'pending']).optional() },
    handler: async (a) => {
      const completedLookup = a.status === 'pending';
      let r;
      if (completedLookup && !a.taskId) { const all = await T.listTasks({ status: 'completed' }); const m = fuzzyMatch(all, a.query ?? '', (t) => t.title); r = m.length === 1 ? { task: m[0] } : { clarify: ask(m.length ? 'Which completed task should I reopen?' : 'No completed task matched.', { candidates: m.slice(0, 6).map((t) => ({ id: t.id, listId: t.listId, title: t.title })) }) }; }
      else r = await resolveTask(a);
      if (r.clarify) return r.clarify;
      const { task } = r;
      return ok({ updated: await T.updateTask({ listId: task.listId, taskId: task.id, title: a.title, notes: a.notes, due: a.due, status: a.status }), before: { title: task.title, due: task.due } });
    } },
  { name: 'tasks_delete', domain: 'tasks', risk: 'write', description: 'Delete tasks immediately from Google Tasks. Use query to select, or deleteCompleted=true for all completed tasks.',
    schema: { ...pick, deleteCompleted: z.boolean().default(false) },
    handler: async (a) => {
      let targets;
      if (a.deleteCompleted) { targets = await T.listTasks({ status: 'completed' }); if (!targets.length) return ask('There are no completed tasks to delete.'); }
      else { const r = await resolveTask(a); if (r.clarify) return r.clarify; targets = [r.task]; }
      const byList = Map.groupBy(targets, (t) => t.listId);
      for (const [listId, ts] of byList) {
        for (const t of ts) await T.deleteTask({ listId, taskId: t.id });
      }
      return ok({ deleted: targets.length, tasks: targets.map((t) => t.title) });
    } },
];
