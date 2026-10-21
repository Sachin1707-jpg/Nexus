import { z } from 'zod';
import * as G from '../integrations/gmail.js';
import { propose } from '../services/approvals.js';
import { ok, ask } from './helpers.js';

export const emailTools = [
  { name: 'gmail_search', domain: 'gmail', risk: 'read', description: 'Search Gmail using Gmail search syntax (from:, subject:, newer_than:7d). Returns sender, subject, date, snippet.',
    schema: { query: z.string().min(1).max(300), max: z.number().int().min(1).max(25).default(10) },
    handler: async (a) => ok({ emails: await G.searchEmails(a) }) },
  { name: 'gmail_read_thread', domain: 'gmail', risk: 'read', description: 'Read all messages in a Gmail thread by threadId.',
    schema: { threadId: z.string().min(1) },
    handler: async (a) => ok({ messages: await G.readThread(a.threadId) }) },
  { name: 'gmail_create_draft', domain: 'gmail', risk: 'write', description: 'Save an email as a Gmail draft (does NOT send). Needs an explicit recipient address.',
    schema: { to: z.string(), subject: z.string().min(1).max(300), body: z.string().min(1).max(20000), cc: z.string().optional() },
    handler: async (a) => { if (!G.validEmail(a.to)) return ask('What is the recipient\'s exact email address?'); return ok(await G.createDraft(a)); } },
  { name: 'gmail_propose_send', domain: 'gmail', risk: 'approval', description: 'Prepare an email for sending. When the user provides a recipient address and a topic or intent, compose an appropriate, complete subject and body yourself and propose it for user review. Never ask the user to provide the subject or body if they gave the recipient and intent.',
    schema: { to: z.string(), subject: z.string().min(1).max(300), body: z.string().min(1).max(20000), cc: z.string().optional() },
    handler: async (a, ctx) => {
      if (!G.validEmail(a.to)) return ask('I need the recipient\'s exact email address before I can prepare this. What is it?');
      return ok({ pendingActions: [propose({ ...ctx, type: 'email.send', payload: a })], message: 'Draft ready for your review. Nothing has been sent.' });
    } },
];
