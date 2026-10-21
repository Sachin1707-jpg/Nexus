import { useMemo, useState } from 'react';
import { Plus, Check, RotateCcw, Trash2, Pencil } from 'lucide-react';
import { api, callTool } from '../services/api.js';
import { useApp } from '../services/store.jsx';
import { useAsync, Loading, Empty, IntegrationGate, PageHead, Modal } from '../components/ui.jsx';
import ActionCard from '../components/ActionCard.jsx';
import { todayStr, fmtDate } from '../services/format.js';

export default function Tasks() {
  const { settings, toast } = useApp(); const today = todayStr(settings.timezone);
  const [filter, setFilter] = useState('pending'); const [view, setView] = useState('list'); const [edit, setEdit] = useState(null); const [pend, setPend] = useState(null); const [dup, setDup] = useState(null);
  const { loading, data, error, reload } = useAsync(async () => { const r = await callTool('tasks_list', { status: 'all' }); if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code }); return r.data.tasks; }, []);
  const tasks = data ?? [];
  const shown = useMemo(() => tasks.filter((t) => filter === 'all' || (filter === 'overdue' ? t.status === 'pending' && t.due && t.due < today : t.status === filter)), [tasks, filter, today]);
  const run = async (name, args, ok) => { const r = await callTool(name, args); if (r.needsClarification) { if (r.duplicates) setDup({ name, args, q: r.question }); else toast(r.question, 'bad'); return r; } if (!r.ok) { toast(r.error ?? 'Failed', 'bad'); return r; } if (r.pendingActionsView) setPend(r.pendingActionsView[0]); else toast(ok, 'ok'); reload(); return r; };
  const toggle = (t) => run('tasks_update', { taskId: t.id, listId: t.listId, status: t.status === 'completed' ? 'pending' : 'completed' }, t.status === 'completed' ? 'Task reopened' : 'Task completed');
  const del = (t) => run('tasks_delete', { taskId: t.id, listId: t.listId }, '');
  const delCompleted = () => run('tasks_delete', { deleteCompleted: true }, '');
  const Item = ({ t }) => <div className="row" style={{ padding: '10px 2px' }}>
    <button className="btn icon-btn sm" onClick={() => toggle(t)} aria-label={t.status === 'completed' ? `Reopen ${t.title}` : `Complete ${t.title}`} style={t.status === 'completed' ? { background: 'var(--ok-soft)' } : undefined}>{t.status === 'completed' ? <RotateCcw size={14} /> : <Check size={14} />}</button>
    <div className="grow"><div style={t.status === 'completed' ? { textDecoration: 'line-through', color: 'var(--text-3)' } : undefined}>{t.title}</div>{t.notes && <div className="small faint">{t.notes}</div>}</div>
    {t.due && <span className={`badge ${t.status === 'pending' && t.due < today ? 'bad' : ''}`}>{t.status === 'pending' && t.due < today ? 'Overdue · ' : ''}{fmtDate(t.due)}</span>}
    <button className="btn ghost icon-btn sm" onClick={() => setEdit(t)} aria-label={`Edit ${t.title}`}><Pencil size={14} /></button><button className="btn ghost icon-btn sm" onClick={() => del(t)} aria-label={`Delete ${t.title}`}><Trash2 size={14} /></button></div>;
  return (
    <div className="page">
      <PageHead title="Tasks" sub="Synced with Google Tasks">
        <div className="tabs" role="tablist">{['pending', 'overdue', 'completed', 'all'].map((f) => <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div>
        <div className="tabs" role="tablist" aria-label="View">{['list', 'board'].map((f) => <button key={f} role="tab" aria-selected={view === f} onClick={() => setView(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div>
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} />New task</button>
      </PageHead>
      {pend && <ActionCard action={pend} onChange={(a) => { setPend(a); if (a.executionStatus === 'succeeded') reload(); }} />}
      {loading ? <div className="card"><Loading lines={5} /></div> : error ? <div className="card"><IntegrationGate error={error} onRetry={reload} what="tasks" /></div> :
        view === 'list' ? <div className="card">{!shown.length ? <Empty title={filter === 'pending' ? 'No pending tasks' : 'No tasks here'}>Create one with “New task” or tell Nexus in the Assistant.</Empty> : <div className="list">{shown.map((t) => <Item key={t.id} t={t} />)}</div>}
          {filter === 'completed' && shown.length > 0 && <div style={{ marginTop: 12 }}><button className="btn danger" onClick={delCompleted}><Trash2 size={15} />Delete all completed…</button></div>}</div> :
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>{[['Overdue', (t) => t.status === 'pending' && t.due && t.due < today], ['Upcoming', (t) => t.status === 'pending' && !(t.due && t.due < today)], ['Completed', (t) => t.status === 'completed']].map(([n, f]) => <div className="card" key={n}><h2>{n} <span className="badge">{tasks.filter(f).length}</span></h2><div className="list">{tasks.filter(f).map((t) => <Item key={t.id} t={t} />)}</div></div>)}</div>}
      {edit && <TaskEditor task={edit} onClose={() => setEdit(null)} onSave={async (v) => { const r = edit.id ? await run('tasks_update', { taskId: edit.id, listId: edit.listId, ...v }, 'Task updated') : await run('tasks_create', v, 'Task created and confirmed in Google Tasks'); if (r.ok) setEdit(null); }} />}
      {dup && <Modal title="Possible duplicate" onClose={() => setDup(null)}><p>{dup.q}</p><div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setDup(null)}>Cancel</button><button className="btn primary" onClick={async () => { const d = dup; setDup(null); await run(d.name, { ...d.args, allowDuplicate: true }, 'Task created'); setEdit(null); }}>Create anyway</button></div></Modal>}
    </div>
  );
}
function TaskEditor({ task, onClose, onSave }) {
  const [title, setTitle] = useState(task.title ?? ''); const [notes, setNotes] = useState(task.notes ?? ''); const [due, setDue] = useState(task.due ?? ''); const [busy, setBusy] = useState(false);
  return <Modal title={task.id ? 'Edit task' : 'New task'} onClose={onClose}>
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave({ title: title.trim(), notes: notes || undefined, due: due || (task.id ? null : undefined) }); setBusy(false); }}>
      <div className="field"><label htmlFor="tt">Title</label><input id="tt" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
      <div className="field"><label htmlFor="td">Due date</label><input id="td" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} /></div>
      <div className="field"><label htmlFor="tn">Notes</label><textarea id="tn" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !title.trim()}>{task.id ? 'Save changes' : 'Create task'}</button></div></form></Modal>;
}
