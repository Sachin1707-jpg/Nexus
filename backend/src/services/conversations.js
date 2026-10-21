import { getDb } from '../database/db.js';
import { randomId } from '../security/crypto.js';
import { httpError } from '../security/paths.js';

const now = () => new Date().toISOString();

export function createConversation(sessionId, { saveHistory = true, includeInInsights = true } = {}) {
  const id = randomId();
  getDb().prepare('INSERT INTO conversations (id,session_id,save_history,include_in_insights,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(id, sessionId, saveHistory ? 1 : 0, includeInInsights ? 1 : 0, now(), now());
  return getConversation(sessionId, id);
}
export function getConversation(sessionId, id) {
  const c = getDb().prepare('SELECT * FROM conversations WHERE id=? AND session_id=?').get(id, sessionId);
  if (!c) throw httpError(404, 'Conversation not found.');
  return c;
}
export function listConversations(sessionId, q) {
  const db = getDb();
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    return db.prepare(`SELECT DISTINCT c.* FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id
      WHERE c.session_id=? AND (c.title LIKE ? OR m.content LIKE ?) ORDER BY c.updated_at DESC LIMIT 100`).all(sessionId, like, like);
  }
  return db.prepare('SELECT * FROM conversations WHERE session_id=? ORDER BY updated_at DESC LIMIT 100').all(sessionId);
}
export function patchConversation(sessionId, id, patch) {
  getConversation(sessionId, id);
  const db = getDb();
  if (patch.title !== undefined) db.prepare('UPDATE conversations SET title=? WHERE id=?').run(String(patch.title).slice(0, 120), id);
  if (patch.saveHistory !== undefined) db.prepare('UPDATE conversations SET save_history=? WHERE id=?').run(patch.saveHistory ? 1 : 0, id);
  if (patch.includeInInsights !== undefined) db.prepare('UPDATE conversations SET include_in_insights=? WHERE id=?').run(patch.includeInInsights ? 1 : 0, id);
  return getConversation(sessionId, id);
}
export function deleteConversation(sessionId, id) {
  getConversation(sessionId, id);
  getDb().prepare('DELETE FROM conversations WHERE id=?').run(id);
}
export function addMessage(conversationId, role, content, meta) {
  const id = randomId();
  const db = getDb();
  db.prepare('INSERT INTO messages (id,conversation_id,role,content,meta,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, conversationId, role, content, meta ? JSON.stringify(meta) : null, now());
  db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(now(), conversationId);
  return id;
}
export function getMessages(conversationId, limit = 200) {
  return getDb().prepare('SELECT * FROM (SELECT rowid AS rid, * FROM messages WHERE conversation_id=? ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY rid ASC')
    .all(conversationId, limit).map(({ rid, ...m }) => ({ ...m, meta: m.meta ? JSON.parse(m.meta) : null }));
}
export function purgeOlderThan(days) {
  if (!days) return 0;
  const cutoff = new Date(Date.now() - days * 864e5).toISOString();
  return getDb().prepare('DELETE FROM conversations WHERE updated_at < ?').run(cutoff).changes;
}
/** Simple transparent retrieval: keyword overlap over this session's saved messages. */
export function searchHistory(sessionId, query, excludeConversation, limit = 5) {
  const words = [...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])].slice(0, 8);
  if (!words.length) return [];
  const rows = getDb().prepare(`SELECT m.content, m.role, m.created_at, m.conversation_id FROM messages m
    JOIN conversations c ON c.id=m.conversation_id WHERE c.session_id=? AND c.save_history=1 AND m.conversation_id != ?
    ORDER BY m.created_at DESC LIMIT 400`).all(sessionId, excludeConversation ?? '');
  return rows.map((r) => ({ ...r, score: words.filter((w) => r.content.toLowerCase().includes(w)).length }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
