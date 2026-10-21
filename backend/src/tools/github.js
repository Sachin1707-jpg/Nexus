import { z } from 'zod';
import * as G from '../integrations/github.js';
import { propose } from '../services/approvals.js';
import { ok } from './helpers.js';

const repo = { owner: z.string().regex(/^[\w.-]+$/), repo: z.string().regex(/^[\w.-]+$/) };
export const githubTools = [
  { name: 'github_list_repos', domain: 'github', risk: 'read', description: 'List the user\'s GitHub repositories.', schema: { limit: z.number().int().min(1).max(100).default(30) }, handler: async (a) => ok({ repos: await G.listRepos(a.limit) }) },
  { name: 'github_read_repo_tree', domain: 'github', risk: 'read', description: 'List files in a repository.', schema: { ...repo, ref: z.string().optional() }, handler: async (a) => ok(await G.readTree(a.owner, a.repo, a.ref)) },
  { name: 'github_get_file_content', domain: 'github', risk: 'read', description: 'Read a file from a repository.', schema: { ...repo, path: z.string().min(1), ref: z.string().optional() }, handler: async (a) => ok(await G.getFile(a.owner, a.repo, a.path, a.ref)) },
  { name: 'github_compare_commits', domain: 'github', risk: 'read', description: 'Compare two branches/commits.', schema: { ...repo, base: z.string().min(1), head: z.string().min(1) }, handler: async (a) => ok(await G.compare(a.owner, a.repo, a.base, a.head)) },
  { name: 'github_review_code', domain: 'github', risk: 'read', description: 'Scan a repository for bugs, security and maintainability issues (static, nothing is executed).', schema: { ...repo, ref: z.string().optional() }, handler: async (a) => ok(await G.reviewCode(a.owner, a.repo, { ref: a.ref })) },
  { name: 'github_prepare_pr', domain: 'github', risk: 'approval', description: 'Prepare a pull request with full file contents. Shows a diff; the user must approve before anything is written.',
    schema: { ...repo, baseBranch: z.string().optional(), branch: z.string().regex(/^[\w./-]{3,100}$/), title: z.string().min(3), body: z.string().default(''), changes: z.array(z.object({ path: z.string().min(1), content: z.string() })).min(1).max(20) },
    handler: async (a, ctx) => {
      const prev = await G.preparePrPreview(a);
      const changes = a.changes.map((c) => ({ ...c, diff: prev.files.find((f) => f.path === c.path)?.diff }));
      return ok({ pendingActions: [propose({ ...ctx, type: 'github.open_pr', payload: { ...a, baseBranch: prev.base, changes } })] });
    } },
];
