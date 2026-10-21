import { z } from 'zod';
import { get } from '../services/approvals.js';
import { ok } from './helpers.js';

export const actionStatusTools = [
  {
    name: 'action_get_status',
    domain: 'system',
    risk: 'read',
    title: 'Get Action Status',
    description: 'Check the approval and execution status of a proposed action by ID (read-only).',
    schema: { id: z.string().min(1) },
    handler: async (args, ctx) => {
      const sessionId = ctx?.sessionId || 'mcp-external';
      const a = get(sessionId, args.id);
      const data = {
        id: a.id,
        type: a.type,
        summary: a.summary,
        approvalStatus: a.approvalStatus,
        executionStatus: a.executionStatus,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
        error: a.error ?? null,
      };
      const summary = `Action "${a.summary}" is ${a.approvalStatus}${a.executionStatus !== 'not_started' ? ` and ${a.executionStatus}` : ''}.`;
      return ok(data, summary);
    },
  },
];
