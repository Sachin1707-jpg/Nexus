import { z } from 'zod';
import * as S from '../integrations/system.js';
import { propose } from '../services/approvals.js';
import { ok, fail } from './helpers.js';

export const systemTools = [
  { name: 'system_get_health', domain: 'system', risk: 'read', description: 'Read-only CPU, RAM, disk, and battery health of this computer.', schema: {}, handler: async () => ok(await S.getHealth()) },
  { name: 'system_list_processes', domain: 'system', risk: 'read', description: 'Top processes by memory or cpu (read-only).',
    schema: { sortBy: z.enum(['memory', 'cpu']).default('memory'), limit: z.number().int().min(1).max(25).default(10) },
    handler: async (a) => { const p = await S.listProcesses(a); return p ? ok(p) : fail('Process information is not available on this system.'); } },
  { name: 'system_find_large_files', domain: 'system', risk: 'read', description: 'Find large files inside an approved directory (read-only).',
    schema: { dir: z.string().min(1), minMB: z.number().min(1).max(100000).default(100), limit: z.number().int().min(1).max(100).default(25) },
    handler: async (a) => ok(await S.findLargeFiles(a)) },
  { name: 'system_maintenance_recommendations', domain: 'system', risk: 'read', description: 'Interpret live metrics and suggest safe maintenance steps.', schema: {},
    handler: async () => { const [h, p] = await Promise.all([S.getHealth(), S.listProcesses({ limit: 5 })]); return ok({ recommendations: S.recommendations(h, p), health: h, topProcesses: p?.top ?? [] }); } },
  { name: 'system_propose_delete_files', domain: 'system', risk: 'approval', description: 'Propose deleting specific files inside approved directories (needs approval).',
    schema: { paths: z.array(z.string().min(1)).min(1).max(50) },
    handler: async (a, ctx) => ok({ pendingActions: [propose({ ...ctx, type: 'system.delete_files', payload: a })] }) },
  { name: 'system_propose_kill_process', domain: 'system', risk: 'approval', description: 'Propose stopping a process by pid and exact name (needs approval).',
    schema: { pid: z.number().int().positive(), name: z.string().min(1), command: z.string().optional() },
    handler: async (a, ctx) => ok({ pendingActions: [propose({ ...ctx, type: 'system.kill_process', payload: a })] }) },
];
