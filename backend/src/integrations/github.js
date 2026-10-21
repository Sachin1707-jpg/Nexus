import { config } from '../config.js';
import { httpError } from '../security/paths.js';

const API = 'https://api.github.com';
export const githubConfigured = () => Boolean(config.GITHUB_TOKEN);

export async function gh(pathname, { method = 'GET', body, raw = false } = {}) {
  if (!config.GITHUB_TOKEN) throw httpError(401, 'GitHub is not connected. Set GITHUB_TOKEN in .env (fine-grained token, read access).', 'github_not_configured');
  let r;
  try {
    r = await fetch(`${API}${pathname}`, {
      method, signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${config.GITHUB_TOKEN}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nexus-assistant', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw httpError(502, 'Could not reach GitHub.', 'github_network'); }
  if (!r.ok) {
    const msg = { 401: 'GitHub rejected the token.', 403: 'GitHub denied access (permissions or rate limit).', 404: 'Repository or file not found, or the token cannot see it.', 422: 'GitHub could not process that request.' }[r.status] ?? `GitHub error (${r.status}).`;
    throw httpError(r.status === 404 ? 404 : r.status >= 500 ? 502 : r.status, msg, 'github_api');
  }
  return raw ? r.text() : r.json();
}
const repoPath = (owner, repo) => { if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw httpError(400, 'Invalid repository name.'); return `/repos/${owner}/${repo}`; };
const refPath = (s) => s.split('/').map(encodeURIComponent).join('/');

export async function listRepos(limit = 30) {
  const j = await gh(`/user/repos?per_page=${Math.min(limit, 100)}&sort=pushed`);
  return j.map((r) => ({ fullName: r.full_name, private: r.private, language: r.language, description: r.description, pushedAt: r.pushed_at, defaultBranch: r.default_branch, stars: r.stargazers_count }));
}
export async function readTree(owner, repo, ref) {
  const base = repoPath(owner, repo);
  const branch = ref || (await gh(base)).default_branch;
  const t = await gh(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  return { ref: branch, truncated: t.truncated, entries: t.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, size: e.size })) };
}
export async function getFile(owner, repo, filePath, ref) {
  if (filePath.includes('..')) throw httpError(400, 'Invalid file path.');
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const text = await gh(`${repoPath(owner, repo)}/contents/${refPath(filePath)}${q}`, { raw: true });
  return { path: filePath, content: text.slice(0, 200000), truncated: text.length > 200000 };
}
export async function compare(owner, repo, base, head) {
  const j = await gh(`${repoPath(owner, repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  return { status: j.status, ahead: j.ahead_by, behind: j.behind_by, totalCommits: j.total_commits, commits: j.commits.slice(0, 30).map((c) => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0], author: c.commit.author?.name })), files: (j.files ?? []).slice(0, 100).map((f) => ({ path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: (f.patch ?? '').slice(0, 6000) })) };
}

const RULES = [
  { re: /\b(eval|new Function)\s*\(/, sev: 'security', confirmed: true, title: 'Dynamic code execution', why: 'Executing strings as code can allow injection.', fix: 'Replace with a parser or explicit lookup table.' },
  { re: /(api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"]/i, sev: 'security', confirmed: false, title: 'Possible hardcoded credential', why: 'Secrets in source control are exposed to anyone with repo access.', fix: 'Move to environment variables and rotate the credential.' },
  { re: /catch\s*(\([^)]*\))?\s*\{\s*\}/, sev: 'bug', confirmed: true, title: 'Empty catch block', why: 'Errors are silently swallowed, hiding failures.', fix: 'Log or handle the error, or rethrow.' },
  { re: /innerHTML\s*=|dangerouslySetInnerHTML/, sev: 'security', confirmed: false, title: 'Raw HTML injection point', why: 'Unsanitized content here can cause XSS.', fix: 'Sanitize input or use textContent / safe rendering.' },
  { re: /\bTODO\b|\bFIXME\b/, sev: 'todo', confirmed: true, title: 'TODO/FIXME marker', why: 'Unfinished work noted in code.', fix: 'Resolve it or track it as an issue.' },
  { re: /(execSync|exec)\s*\(\s*[`'"].*\$\{|child_process.*exec\(.*\+/, sev: 'security', confirmed: false, title: 'Possible command injection', why: 'Building shell commands from variables can allow injection.', fix: 'Use execFile with an argument array.' },
  { re: /==\s*null|[^=!]==[^=]/, sev: 'maintainability', confirmed: false, title: 'Loose equality', why: 'Type coercion can cause surprising comparisons.', fix: 'Use === unless coercion is intended.', skipIf: /==\s*null/ },
  { re: /console\.log\(/, sev: 'maintainability', confirmed: true, title: 'Leftover console.log', why: 'Debug output can leak data and add noise.', fix: 'Remove or use a proper logger.' },
];
export function scanSource(filePath, content) {
  const findings = [];
  content.split('\n').forEach((line, i) => {
    if (line.length > 400) return;
    for (const r of RULES) if (r.re.test(line) && !(r.skipIf && r.skipIf.test(line))) findings.push({ file: filePath, line: i + 1, severity: r.sev, status: r.confirmed ? 'confirmed-pattern' : 'possible', title: r.title, why: r.why, suggestion: r.fix, excerpt: line.trim().slice(0, 160) });
  });
  return findings;
}
const CODE = /\.(js|jsx|ts|tsx|py|java|go|rb|php|cs|rs|c|cpp|h|sh|ps1)$/i;
export async function reviewCode(owner, repo, { ref, maxFiles = 25 } = {}) {
  const tree = await readTree(owner, repo, ref);
  const files = tree.entries.filter((e) => CODE.test(e.path) && e.size < 100000 && !/node_modules|dist\/|\.min\./.test(e.path)).slice(0, maxFiles);
  const findings = [];
  for (const f of files) { const c = await getFile(owner, repo, f.path, ref); findings.push(...scanSource(f.path, c.content)); }
  return { ref: tree.ref, filesInspected: files.length, totalCodeFiles: tree.entries.filter((e) => CODE.test(e.path)).length, findings, disclaimer: 'Static pattern scan only. Code was inspected, not executed or tested.' };
}
export function lineDiff(oldText, newText) {
  const a = oldText.split('\n'), b = newText.split('\n'); const out = [];
  const n = a.length, m = b.length; const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { out.push(`  ${a[i]}`); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(`- ${a[i++]}`); else out.push(`+ ${b[j++]}`); }
  while (i < n) out.push(`- ${a[i++]}`); while (j < m) out.push(`+ ${b[j++]}`);
  return out.join('\n');
}
export async function preparePrPreview({ owner, repo, baseBranch, changes }) {
  const base = baseBranch || (await gh(repoPath(owner, repo))).default_branch;
  const files = [];
  for (const c of changes) {
    let old = ''; let isNew = false;
    try { old = (await getFile(owner, repo, c.path, base)).content; } catch (e) { if (e.status === 404) isNew = true; else throw e; }
    files.push({ path: c.path, isNew, diff: lineDiff(old, c.content) });
  }
  return { base, files };
}
export async function openPullRequest({ owner, repo, baseBranch, branch, title, body, changes, commitMessage }) {
  const rp = repoPath(owner, repo);
  const baseRef = await gh(`${rp}/git/ref/heads/${refPath(baseBranch)}`);
  await gh(`${rp}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: baseRef.object.sha } });
  for (const c of changes) {
    let sha;
    try { const ex = await gh(`${rp}/contents/${refPath(c.path)}?ref=${encodeURIComponent(branch)}`); sha = ex.sha; } catch (e) { if (e.status !== 404) throw e; }
    await gh(`${rp}/contents/${refPath(c.path)}`, { method: 'PUT', body: { message: commitMessage || title, content: Buffer.from(c.content, 'utf8').toString('base64'), branch, ...(sha ? { sha } : {}) } });
  }
  const pr = await gh(`${rp}/pulls`, { method: 'POST', body: { title, head: branch, base: baseBranch, body } });
  const check = await gh(`${rp}/pulls/${pr.number}`);
  if (check.state !== 'open') throw new Error('Verification failed: pull request is not open.');
  return { number: check.number, url: check.html_url };
}
