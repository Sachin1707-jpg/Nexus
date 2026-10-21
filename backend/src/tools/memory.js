import { z } from 'zod';
import { getDb } from '../database/db.js';
import { randomId } from '../security/crypto.js';
import { ok } from './helpers.js';

export const memoryTools = [
  { name: 'memory_save', domain: 'memory', risk: 'write', description: 'Save a long-term memory ONLY when the user explicitly asks you to remember something. Keep it short and non-sensitive.',
    schema: { content: z.string().min(3).max(300) },
    handler: async (a, ctx) => { const id = randomId(); getDb().prepare('INSERT INTO memories (id,content,source_conversation,created_at) VALUES (?,?,?,?)').run(id, a.content, ctx.conversationId ?? null, new Date().toISOString()); return ok({ saved: a.content, id }); } },
  { name: 'memory_list', domain: 'memory', risk: 'read', description: 'List saved long-term memories.', schema: {},
    handler: async () => ok({ memories: getDb().prepare('SELECT id,content,created_at FROM memories ORDER BY created_at DESC LIMIT 50').all() }) },
];
