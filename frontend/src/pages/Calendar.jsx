import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil } from 'lucide-react';
import { callTool } from '../services/api.js';
import { useApp } from '../services/store.jsx';
import { useAsync, Loading, Empty, IntegrationGate, PageHead, Modal } from '../components/ui.jsx';
import ActionCard from '../components/ActionCard.jsx';
import { todayStr, addDays, weekStart, fmtTime, fmtDate } from '../services/format.js';

function range(view, anchor) {
  if (view === 'day') return [anchor, anchor];
  if (view === 'week') { const s = weekStart(anchor); return [s, addDays(s, 6)]; }
  const [y, m] = anchor.split('-').map(Number); const first = `${y}-${String(m).padStart(2, '0')}-01`; const s = weekStart(first);
  return [s, addDays(s, 41)];
}
export default function Calendar() {
  const { settings, toast } = useApp(); const today = todayStr(settings.timezone);
  const [view, setView] = useState('week'); const [anchor, setAnchor] = useState(today); const [edit, setEdit] = useState(null); const [pend, setPend] = useState(null); const [conf, setConf] = useState(null);
  const [from, to] = range(view, anchor);
  const { loading, data, error, reload } = useAsync(async () => { const r = await callTool('calendar_list_events', { from, to }); if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code }); return r.data.events; }, [from, to]);
  const evs = data ?? [];
  const byDay = useMemo(() => { const m = {}; for (const e of evs) (m[e.start.slice(0, 10)] ??= []).push(e); return m; }, [evs]);
  const step = (n) => setAnchor(view === 'month' ? (() => { const [y, m] = anchor.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); })() : addDays(anchor, n * (view === 'week' ? 7 : 1)));
  const days = Array.from({ length: view === 'day' ? 1 : view === 'week' ? 7 : 42 }, (_, i) => addDays(from, i));
  const del = async (e) => { const r = await callTool('calendar_delete_event', { eventId: e.id }); if (r.pendingActionsView) setPend(r.pendingActionsView[0]); else toast(r.error ?? r.question, 'bad'); };
  const save = async (v) => {
    if (edit.id) { const r = await callTool('calendar_update_event', { eventId: edit.id, ...v }); if (r.pendingActionsView) { setPend(r.pendingActionsView[0]); setEdit(null); if (r.data?.conflictWarning) toast(r.data.conflictWarning, 'bad'); } else toast(r.error ?? r.question, 'bad'); return; }
    const r = await callTool('calendar_create_event', v);
    if (r.needsClarification && r.conflicts) { setConf({ v, q: r.question }); return; }
    if (!r.ok) { toast(r.error ?? r.question, 'bad'); return; }
    toast('Event created and confirmed in Google Calendar', 'ok'); setEdit(null); reload();
  };
  const Ev = ({ e }) => <div className="row" style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--accent-soft)', borderLeft: '3px solid var(--accent)', fontSize: 13 }}>
    <div className="grow" style={{ minWidth: 0 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div><div className="faint" style={{ fontSize: 12 }}>{fmtTime(e.start)}{!e.allDay && ` – ${fmtTime(e.end)}`}{e.location && ` · ${e.location}`}</div></div>
    <button className="btn ghost icon-btn sm" aria-label={`Edit ${e.title}`} onClick={() => setEdit({ id: e.id, title: e.title, date: e.start.slice(0, 10), startTime: e.allDay ? '09:00' : e.start.slice(11, 16), endTime: e.allDay ? '10:00' : e.end.slice(11, 16), location: e.location })}><Pencil size={13} /></button>
    <button className="btn ghost icon-btn sm" aria-label={`Cancel ${e.title}`} onClick={() => del(e)}><Trash2 size={13} /></button></div>;
  return (
    <div className="page">
      <PageHead title="Calendar" sub="Synced with Google Calendar">
        <div className="tabs" role="tablist">{['day', 'week', 'month'].map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div>
        <button className="btn icon-btn" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft size={16} /></button><button className="btn" onClick={() => setAnchor(today)}>Today</button><button className="btn icon-btn" onClick={() => step(1)} aria-label="Next"><ChevronRight size={16} /></button>
        <button className="btn primary" onClick={() => setEdit({ date: anchor, startTime: '10:00', endTime: '11:00' })}><Plus size={16} />New event</button></PageHead>
      {pend && <ActionCard action={pend} onChange={(a) => { setPend(a); if (a.executionStatus === 'succeeded') reload(); }} />}
      {loading ? <div className="card"><Loading lines={5} /></div> : error ? <div className="card"><IntegrationGate error={error} onRetry={reload} what="calendar" /></div> :
        view === 'month' ? <div className="card" style={{ padding: 12 }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="faint small" style={{ textAlign: 'center' }}>{d}</div>)}
          {days.map((d) => <div key={d} style={{ minHeight: 84, padding: 4, borderRadius: 8, background: d === today ? 'var(--accent-soft)' : 'var(--bg-2)', opacity: d.slice(0, 7) === anchor.slice(0, 7) ? 1 : .45, overflow: 'hidden' }}><div className="small muted">{+d.slice(8)}</div>{(byDay[d] ?? []).slice(0, 3).map((e) => <div key={e.id} style={{ fontSize: 11.5, background: 'var(--accent-soft)', borderRadius: 4, padding: '1px 4px', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.title}>{e.title}</div>)}{(byDay[d]?.length ?? 0) > 3 && <div className="faint" style={{ fontSize: 11 }}>+{byDay[d].length - 3} more</div>}</div>)}</div>
          {!evs.length && <Empty title="No events this month" />}</div> :
        <div className="stack">{days.map((d) => <section className="card" key={d} style={d === today ? { borderColor: 'var(--accent-line)' } : undefined}><h2>{fmtDate(d)} {d === today && <span className="badge accent">Today</span>}</h2>{(byDay[d] ?? []).length ? <div className="stack" style={{ gap: 6 }}>{byDay[d].map((e) => <Ev key={e.id} e={e} />)}</div> : <div className="faint small">Nothing scheduled.</div>}</section>)}</div>}
      {edit && <EventEditor ev={edit} onClose={() => setEdit(null)} onSave={save} />}
      {conf && <Modal title="Scheduling conflict" onClose={() => setConf(null)}><p>{conf.q}</p><div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setConf(null)}>Choose another time</button><button className="btn primary" onClick={async () => { const c = conf; setConf(null); await save({ ...c.v, ignoreConflicts: true }); }}>Schedule anyway</button></div></Modal>}
    </div>
  );
}
function EventEditor({ ev, onClose, onSave }) {
  const [v, setV] = useState({ title: ev.title ?? '', date: ev.date, startTime: ev.startTime, endTime: ev.endTime, location: ev.location ?? '' }); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return <Modal title={ev.id ? 'Edit event (needs approval)' : 'New event'} onClose={onClose}><form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave({ ...v, location: v.location || undefined }); setBusy(false); }}>
    <div className="field"><label htmlFor="et">Title</label><input id="et" className="input" required value={v.title} onChange={set('title')} autoFocus /></div>
    <div className="row wrap"><div className="field grow"><label htmlFor="ed">Date</label><input id="ed" type="date" className="input" required value={v.date} onChange={set('date')} /></div><div className="field"><label htmlFor="es">Start</label><input id="es" type="time" className="input" required value={v.startTime} onChange={set('startTime')} /></div><div className="field"><label htmlFor="ee">End</label><input id="ee" type="time" className="input" required value={v.endTime} onChange={set('endTime')} /></div></div>
    <div className="field"><label htmlFor="el">Location</label><input id="el" className="input" value={v.location} onChange={set('location')} /></div>
    {v.endTime <= v.startTime && <div className="small" style={{ color: 'var(--bad)' }}>End time must be after start time.</div>}
    <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || v.endTime <= v.startTime}>{ev.id ? 'Prepare change' : 'Create event'}</button></div></form></Modal>;
}
