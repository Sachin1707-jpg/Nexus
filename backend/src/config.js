import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { z } from 'zod';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const schema = z.object({
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default('127.0.0.1'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  NODE_ENV: z.string().default('development'),
  TIMEZONE: z.string().default('Asia/Kolkata'),
  DATA_DIR: z.string().default(path.join(root, 'data')),
  SESSION_SECRET: z.string().transform((s) => s.trim() || crypto.randomBytes(32).toString('hex')).pipe(z.string().min(16)),
  TOKEN_ENCRYPTION_KEY: z.string().default(''),
  MCP_AUTH_TOKEN: z.string().default(() => crypto.randomBytes(24).toString('hex')),
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
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
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
  think: env.OLLAMA_THINK === 'true',
  approvedDirs: env.APPROVED_DIRS.split(';').map((s) => s.trim()).filter(Boolean),
  isProd: env.NODE_ENV === 'production',
};
