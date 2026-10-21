import { logger } from '../logger.js';
import { ZodError } from 'zod';

export function notFound(req, res) { res.status(404).json({ error: 'Not found' }); }

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid input', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  }
  const status = err.status || 500;
  if (status >= 500) logger.error('request failed', { path: req.path, message: err.message });
  res.status(status).json({
    error: err.expose ? err.message : status >= 500 ? 'Something went wrong on the server.' : err.message,
    code: err.code,
  });
}
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
