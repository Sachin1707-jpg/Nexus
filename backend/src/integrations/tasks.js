import { gfetch } from './google.js';
const BASE = 'https://tasks.googleapis.com/tasks/v1';

export async function listTaskLists() {
  const j = await gfetch(`${BASE}/users/@me/lists`, { query: { maxResults: 100 } });
  return (j.items ?? []).map((l) => ({ id: l.id, title: l.title }));
}
async function defaultList() { const ls = await listTaskLists(); if (!ls.length) throw new Error('No task lists found'); return ls[0].id; }

const shape = (t, listId, listTitle) => ({
  id: t.id, listId, listTitle, title: t.title ?? '', notes: t.notes ?? '', status: t.status === 'completed' ? 'completed' : 'pending',
  due: t.due ? t.due.slice(0, 10) : null, completed: t.completed ?? null, updated: t.updated,
});

export async function listTasks({ status = 'pending', listId, dueBefore, dueOn } = {}) {
  const lists = listId ? [{ id: listId, title: '' }] : await listTaskLists();
  const out = [];
  for (const l of lists) {
    let pageToken;
    do {
      const j = await gfetch(`${BASE}/lists/${l.id}/tasks`, { query: { maxResults: 100, showCompleted: status !== 'pending', showHidden: status !== 'pending', pageToken } });
      for (const t of j.items ?? []) out.push(shape(t, l.id, l.title));
      pageToken = j.nextPageToken;
    } while (pageToken);
  }
  let r = out.filter((t) => t.title);
  if (status === 'pending') r = r.filter((t) => t.status === 'pending');
  if (status === 'completed') r = r.filter((t) => t.status === 'completed');
  if (dueOn) r = r.filter((t) => t.due === dueOn);
  if (dueBefore) r = r.filter((t) => t.due && t.due <= dueBefore);
  return r;
}
export async function getTask(listId, id) { const t = await gfetch(`${BASE}/lists/${listId}/tasks/${id}`); return shape(t, listId, ''); }

export async function findDuplicates(title, due) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
  const all = await listTasks({ status: 'pending' });
  return all.filter((t) => norm(t.title) === norm(title) && (!due || !t.due || t.due === due));
}
export async function createTask({ title, notes, due, listId }) {
  const lid = listId ?? (await defaultList());
  const t = await gfetch(`${BASE}/lists/${lid}/tasks`, { method: 'POST', body: { title, notes, ...(due ? { due: `${due}T00:00:00.000Z` } : {}) } });
  const check = await getTask(lid, t.id); // verification against authoritative API
  if (check.title !== title) throw new Error('Verification failed: task not found as created.');
  return check;
}
export async function updateTask({ listId, taskId, title, notes, due, status }) {
  const body = {};
  if (title !== undefined) body.title = title;
  if (notes !== undefined) body.notes = notes;
  if (due !== undefined) body.due = due ? `${due}T00:00:00.000Z` : null;
  if (status === 'completed') body.status = 'completed';
  if (status === 'pending') { body.status = 'needsAction'; body.completed = null; }
  await gfetch(`${BASE}/lists/${listId}/tasks/${taskId}`, { method: 'PATCH', body });
  const check = await getTask(listId, taskId);
  if (status && check.status !== (status === 'completed' ? 'completed' : 'pending')) throw new Error('Verification failed: task status did not change.');
  if (title !== undefined && check.title !== title) throw new Error('Verification failed: title did not change.');
  if (due !== undefined && due && check.due !== due) throw new Error('Verification failed: due date did not change.');
  return check;
}
export async function deleteTask({ listId, taskId }) {
  await gfetch(`${BASE}/lists/${listId}/tasks/${taskId}`, { method: 'DELETE' });
  try { await getTask(listId, taskId); } catch (e) { if (e.status === 404) return true; if (e.code !== 'google_not_found') throw e; return true; }
  // Google may return deleted tasks with a deleted flag; fall through to list check
  const stillThere = (await listTasks({ status: 'all', listId })).some((t) => t.id === taskId);
  if (stillThere) throw new Error('Verification failed: task still exists.');
  return true;
}
