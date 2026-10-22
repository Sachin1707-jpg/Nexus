import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { z } from 'zod';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const schema = z.object({
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().optional().transform((val) => (process.env.RENDER || process.env.NODE_ENV === 'production' ? '0.0.0.0' : (val?.trim() || '127.0.0.1'))),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.string().default('development'),
  TIMEZONE: z.string().default('Asia/Kolkata'),
  DATA_DIR: z.string().default(path.join(root, 'data')),
  SESSION_SECRET: z.string().transform((s) => s.trim() || crypto.randomBytes(32).toString('hex')).pipe(z.string().min(16)),
  TOKEN_ENCRYPTION_KEY: z.string().default(''),
  MCP_AUTH_TOKEN: z.string().optional().transform((s) => s?.trim() ?? '').refine((s) => !s || s.length >= 32, 'MCP_AUTH_TOKEN must be at least 32 characters if set.').transform((s) => s || crypto.randomBytes(24).toString('hex')),
  MCP_READONLY_TOKEN: z.string().optional().transform((s) => s?.trim() ?? '').refine((s) => !s || s.length >= 32, 'MCP_READONLY_TOKEN must be at least 32 characters if set.').default(''),
  MCP_ALLOWED_HOSTS: z.string().default(''),
  MCP_ALLOW_PROPOSE_TOOLS: z.enum(['false', 'true']).default('false'),
  OLLAMA_URL: z.string().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen3:4b'),
  OLLAMA_THINK: z.enum(['false', 'true']).default('false'),
  OLLAMA_KEEP_ALIVE: z.string().default('30m'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:8787/api/auth/google/callback'),
  GITHUB_TOKEN: z.string().default(''),
  NEWS_API_KEY: z.string().default(''),
  DEFAULT_LOCATION: z.string().default(''),
  APPROVED_DIRS: z.string().default(''),
  WHISPER_URL: z.string().default('http://127.0.0.1:8788'),
  APPROVAL_TTL_MINUTES: z.coerce.number().default(15),
  APPROVAL_MAX_PENDING: z.coerce.number().int().positive().default(20),
  GROQ_API_KEY: z.string().default(''),
  GROQ_MODEL: z.string().default('qwen/qwen3.8-27b'),
}).refine((data) => !data.MCP_READONLY_TOKEN || data.MCP_READONLY_TOKEN !== data.MCP_AUTH_TOKEN, {
  message: 'MCP_READONLY_TOKEN must differ from MCP_AUTH_TOKEN',
  path: ['MCP_READONLY_TOKEN'],
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  process.exit(1);
}
const env = parsed.data;

export const config = {
  ...env,
  root,
  hasCustomMcpToken: Boolean(process.env.MCP_AUTH_TOKEN?.trim()),
  mcpAllowedHosts: env.MCP_ALLOWED_HOSTS.split(';').map((s) => s.trim().toLowerCase()).filter(Boolean),
  allowProposeToolsInReadOnly: env.MCP_ALLOW_PROPOSE_TOOLS === 'true',
  think: env.OLLAMA_THINK === 'true',
  approvedDirs: env.APPROVED_DIRS.split(';').map((s) => s.trim()).filter(Boolean),
  isProd: env.NODE_ENV === 'production',
};
