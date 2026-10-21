import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, Inbox, X } from 'lucide-react';

export function useAsync(fn, deps = []) {
  const [s, set] = useState({ loading: true, data: null, error: null });
  const run = useCallback(async () => { set((x) => ({ ...x, loading: true, error: null })); try { set({ loading: false, data: await fn(), error: null }); } catch (e) { set({ loading: false, data: null, error: e }); } }, deps); // eslint-disable-line
  useEffect(() => { run(); }, [run]);
  return { ...s, reload: run };
}
export const Spinner = ({ size = 16 }) => <Loader2 size={size} className="spin" aria-label="Loading" />;
export const Loading = ({ lines = 3 }) => <div className="stack" aria-busy="true" aria-live="polite">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - i * 18}%` }} />)}</div>;
export const Empty = ({ icon: Icon = Inbox, title, children, action }) => <div className="empty"><Icon size={28} className="faint" /><div><strong>{title}</strong>{children && <div className="muted small" style={{ marginTop: 4 }}>{children}</div>}</div>{action}</div>;
export function ErrorBox({ error, onRetry, children }) {
  if (!error) return null;
  const msg = error.message ?? String(error);
  return <div className="notice bad" role="alert"><AlertTriangle size={18} /><div className="grow"><div>{msg}</div>{children && <div className="small muted" style={{ marginTop: 4 }}>{children}</div>}</div>{onRetry && <button className="btn sm" onClick={onRetry}>Try again</button>}</div>;
}
/** Shows a friendly "connect X" state for integration errors. */
export function IntegrationGate({ error, onRetry, what }) {
  const code = error?.code;
  if (code === 'google_not_connected' || code === 'google_expired') return <Empty title={`Connect Google to see your ${what}`} action={<a className="btn primary" href="/settings">Open settings</a>}>{error.message}</Empty>;
  if (code === 'github_not_configured') return <Empty title="Connect GitHub" action={<a className="btn primary" href="/settings">Open settings</a>}>{error.message}</Empty>;
  return <ErrorBox error={error} onRetry={onRetry} />;
}
export const Switch = ({ checked, onChange, label, id }) => <label className="switch" title={label}><input id={id} type="checkbox" role="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} /><span /></label>;
export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); ref.current?.focus(); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={wide ? { width: 'min(860px,100%)' } : undefined}><div className="row"><h2 className="grow">{title}</h2><button className="btn ghost icon-btn sm" onClick={onClose} aria-label="Close"><X size={16} /></button></div>{children}</div></div>;
}
export const PageHead = ({ title, sub, children }) => <div className="page-head"><div><h1>{title}</h1>{sub && <div className="muted" style={{ marginTop: 2 }}>{sub}</div>}</div><div className="row wrap">{children}</div></div>;
