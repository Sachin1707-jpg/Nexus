import { useEffect, useState } from 'react';
import { Check, X, Pencil, ShieldAlert, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../services/api.js';
import { Modal } from './ui.jsx';

// Mirror of the backend hash so we can send the hash of what the user actually saw.
async function sha256Hex(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
const stable = (v) => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));
export const hashOf = (type, payload) => sha256Hex(type + stable(payload));

const FIELDS = { 'email.send': [['to', 'To', 'input'], ['cc', 'Cc', 'input'], ['subject', 'Subject', 'input'], ['body', 'Message', 'textarea']], 'calendar.update': [['title', 'Title', 'input'], ['date', 'Date (YYYY-MM-DD)', 'input'], ['startTime', 'Start (HH:MM)', 'input'], ['endTime', 'End (HH:MM)', 'input'], ['location', 'Location', 'input']], 'github.open_pr': [['title', 'Pull request title', 'input'], ['body', 'Description', 'textarea'], ['branch', 'New branch name', 'input']] };

export default function ActionCard({ action: initial, onChange }) {
  const [a, setA] = useState(initial); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [edit, setEdit] = useState(false); const [draft, setDraft] = useState(null);
  useEffect(() => setA(initial), [initial]);
  const upd = (x) => { setA(x); onChange?.(x); };
  const refresh = async () => upd(await api(`/actions/${a.id}`));

  const approve = async () => {
    setBusy(true); setErr('');
    try { const hash = await hashOf(a.type, a.payload); upd(await api(`/actions/${a.id}/approve`, { method: 'POST', body: { hash } })); }
    catch (e) { setErr(e.message); if (e.code === 'payload_changed' || e.code === 'expired') refresh().catch(() => {}); }
    finally { setBusy(false); }
  };
  const cancel = async () => { setBusy(true); try { upd(await api(`/actions/${a.id}/cancel`, { method: 'POST' })); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const saveEdit = async () => { setBusy(true); setErr(''); try { upd(await api(`/actions/${a.id}`, { method: 'PATCH', body: { payload: draft } })); setEdit(false); } catch (e) { setErr(e.message); } finally { setBusy(false); } };

  const p = a.preview ?? { title: a.summary, lines: [] };
  const fields = FIELDS[a.type];
  const state = a.executionStatus === 'succeeded' ? 'done' : a.executionStatus === 'failed' ? 'failed' : a.approvalStatus === 'cancelled' || a.approvalStatus === 'expired' ? 'cancelled' : '';
  const pending = a.approvalStatus === 'pending' && a.executionStatus === 'not_started';
  return (
    <div className={`approval ${state}`} role="group" aria-label={`Approval: ${p.title}`}>
      <div className="row"><ShieldAlert size={18} style={{ color: 'var(--accent)' }} /><strong className="grow">{p.title}</strong>
        <span className={`badge ${state === 'done' ? 'ok' : state === 'failed' ? 'bad' : pending ? 'accent' : ''}`}>
          {a.executionStatus === 'running' ? 'Executing…' : a.executionStatus === 'succeeded' ? 'Done and verified' : a.executionStatus === 'failed' ? 'Failed' : a.approvalStatus === 'expired' ? 'Expired' : a.approvalStatus === 'cancelled' ? 'Cancelled' : 'Waiting for you'}</span></div>
      {p.lines?.length > 0 && <div className="lines">{p.lines.map((l, i) => <div key={i}>{l || ' '}</div>)}</div>}
      {p.diff && <pre className="diff">{p.diff.split('\n').map((l, i) => <span key={i} className={l.startsWith('+ ') ? 'add' : l.startsWith('- ') ? 'del' : ''}>{l || ' '}</span>)}</pre>}
      {pending && <div className="small muted">{p.consequence}</div>}
      {a.executionStatus === 'succeeded' && <div className="row small" style={{ color: 'var(--ok)' }}><CheckCircle2 size={16} />Confirmed with the service after running. {a.result?.number ? `Pull request #${a.result.number}` : ''}</div>}
      {a.executionStatus === 'failed' && <div className="row small" style={{ color: 'var(--bad)' }}><XCircle size={16} />{a.error}. Nothing was reported as done.</div>}
      {err && <div className="small" style={{ color: 'var(--bad)' }} role="alert">{err}</div>}
      {pending && <div className="actions">
        <button className="btn primary" onClick={approve} disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}Approve and run</button>
        {fields && <button className="btn" onClick={() => { setDraft({ ...a.payload }); setEdit(true); }} disabled={busy}><Pencil size={15} />Review / edit</button>}
        <button className="btn ghost" onClick={cancel} disabled={busy}><X size={16} />Cancel</button>
      </div>}
      {edit && <Modal title="Edit before approving" onClose={() => setEdit(false)}>
        <div className="stack">{fields.map(([k, label, kind]) => <div className="field" key={k}><label htmlFor={`f-${k}`}>{label}</label>{kind === 'textarea' ? <textarea id={`f-${k}`} className="textarea" rows={8} value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} /> : <input id={`f-${k}`} className="input" value={draft[k] ?? ''} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />}</div>)}</div>
        <div className="small muted">Saving changes cancels any earlier approval. You will need to approve the updated version.</div>
        {err && <div className="small" style={{ color: 'var(--bad)' }}>{err}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setEdit(false)}>Close</button><button className="btn primary" onClick={saveEdit} disabled={busy}>Save changes</button></div>
      </Modal>}
    </div>
  );
}
