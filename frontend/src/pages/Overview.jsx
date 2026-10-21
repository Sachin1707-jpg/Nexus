import { Link, useNavigate } from 'react-router-dom';
import { CheckSquare, CalendarDays, CloudSun, MessageSquare, Sparkles, Plug } from 'lucide-react';
import { useApp } from '../services/store.jsx';
import { callTool } from '../services/api.js';
import { useAsync, Loading, Empty, IntegrationGate, PageHead } from '../components/ui.jsx';
import { todayStr, addDays, fmtTime, fmtDate } from '../services/format.js';

export default function Overview() {
  const { settings, status, convs } = useApp(); const nav = useNavigate();
  const today = todayStr(settings.timezone);
  const tasks = useAsync(async () => { const r = await callTool('tasks_list', { status: 'pending', dueBefore: addDays(today, 7) }); if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code }); return r.data.tasks; }, [today]);
  const events = useAsync(async () => { const r = await callTool('calendar_list_events', { from: today, to: addDays(today, 2) }); if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code }); return r.data.events; }, [today]);
  const weather = useAsync(async () => { if (!settings.location) return null; const r = await callTool('weather_forecast', { location: settings.location }); if (!r.ok) throw new Error(r.error ?? r.question); return r.data; }, [settings.location]);
  const err = (e) => ({ ...e, code: e?.code ?? (e?.message?.includes('not connected') ? 'google_not_connected' : undefined) });
  return (
    <div className="page">
      <PageHead title={settings.userName ? `Welcome back, ${settings.userName}` : 'Command centre'} sub="Live data from your connected accounts. Nothing here is sample data." />
      <form className="card glass row" onSubmit={(e) => { e.preventDefault(); const t = e.currentTarget.q.value.trim(); if (t) nav(`/assistant`, { state: { prefill: t } }); else nav('/assistant'); }}>
        <Sparkles size={18} style={{ color: 'var(--accent)' }} /><label className="sr-only" htmlFor="ask">Ask Nexus</label><input id="ask" name="q" className="input grow" placeholder="Ask Nexus…" style={{ border: 0, background: 'transparent' }} /><button className="btn primary">Ask Nexus</button>
      </form>
      <div className="grid-2">
        <section className="card" aria-labelledby="t1"><div className="row"><h2 id="t1" className="grow"><CheckSquare size={16} style={{ verticalAlign: -2 }} /> Tasks due this week</h2><Link to="/tasks" className="small">All tasks</Link></div>
          {tasks.loading ? <Loading /> : tasks.error ? <IntegrationGate error={err(tasks.error)} onRetry={tasks.reload} what="tasks" /> : !tasks.data.length ? <Empty title="Nothing due this week">Enjoy the quiet, or add a task from the Assistant.</Empty> :
            <div className="list">{tasks.data.slice(0, 6).map((t) => <div key={t.id} className="row"><span className="grow">{t.title}</span>{t.due && <span className={`badge ${t.due < today ? 'bad' : ''}`}>{t.due < today ? 'Overdue' : fmtDate(t.due)}</span>}</div>)}</div>}</section>
        <section className="card" aria-labelledby="t2"><div className="row"><h2 id="t2" className="grow"><CalendarDays size={16} style={{ verticalAlign: -2 }} /> Next 3 days</h2><Link to="/calendar" className="small">Calendar</Link></div>
          {events.loading ? <Loading /> : events.error ? <IntegrationGate error={err(events.error)} onRetry={events.reload} what="events" /> : !events.data.length ? <Empty title="No events in the next 3 days" />:
            <div className="list">{events.data.slice(0, 6).map((e) => <div key={e.id} className="row"><span className="badge">{fmtDate(e.start)} {fmtTime(e.start)}</span><span className="grow">{e.title}</span></div>)}</div>}</section>
        <section className="card" aria-labelledby="t3"><div className="row"><h2 id="t3" className="grow"><CloudSun size={16} style={{ verticalAlign: -2 }} /> Weather</h2><Link to="/weather" className="small">Forecast</Link></div>
          {!settings.location ? <Empty title="No default location">Set one in Settings to see the weather here.</Empty> : weather.loading ? <Loading lines={2} /> : weather.error ? <div className="muted">{weather.error.message}</div> : weather.data && <div><div style={{ fontSize: 34, fontWeight: 600 }}>{Math.round(weather.data.current.temperature_2m)}°C</div><div className="muted">{weather.data.current.summary} in {weather.data.place.name}. Today {Math.round(weather.data.daily[0].tMin)}–{Math.round(weather.data.daily[0].tMax)}°, rain chance {weather.data.daily[0].rainProb ?? 0}%.</div></div>}</section>
        <section className="card" aria-labelledby="t4"><h2 id="t4"><MessageSquare size={16} style={{ verticalAlign: -2 }} /> Recent conversations</h2>
          {!convs.length ? <Empty title="No conversations yet" /> : <div className="list">{convs.slice(0, 5).map((c) => <Link key={c.id} to={`/assistant?c=${c.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{c.title}<div className="faint small">{new Date(c.updated_at).toLocaleString()}</div></Link>)}</div>}</section>
      </div>
      <section className="card" aria-labelledby="t5"><h2 id="t5"><Plug size={16} style={{ verticalAlign: -2 }} /> Connections</h2>
        <div className="row wrap">{[['Ollama model', status?.ollama?.running && status?.ollama?.modelInstalled, status?.ollama?.model], ['Google', status?.google?.connected, status?.google?.email], ['GitHub', status?.github?.configured], ['Local Whisper', status?.whisper?.available], ['MCP server', true, `${status?.mcp?.tools ?? 0} tools`]].map(([n, ok, d]) => <span key={n} className={`badge ${ok ? 'ok' : 'warn'}`}><span className={`dot ${ok ? 'ok' : 'warn'}`} />{n}{d ? `: ${d}` : ok ? '' : ': not connected'}</span>)}</div></section>
    </div>
  );
}
