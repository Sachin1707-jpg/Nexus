import { useState } from 'react';
import { Plug, Play, ShieldCheck, Mic } from 'lucide-react';
import { api, streamChat } from '../services/api.js';
import { useApp } from '../services/store.jsx';
import { useAsync, Loading, ErrorBox, PageHead, Spinner } from '../components/ui.jsx';

const SAMPLE = { system_get_health: {}, weather_forecast: { location: '' }, tasks_list: { status: 'pending' }, calendar_list_events: {}, system_list_processes: { limit: 5 }, memory_list: {} };
export default function AlexaLab() {
  const { status, settings } = useApp();
  const { loading, data, error, reload } = useAsync(() => api('/mcp/tools'), []);
  const [sel, setSel] = useState('system_get_health'); const [args, setArgs] = useState('{}'); const [out, setOut] = useState(null); const [busy, setBusy] = useState(false); const [utter, setUtter] = useState('');
  const tool = data?.tools.find((t) => t.name === sel);
  const pick = (n) => { setSel(n); setArgs(JSON.stringify(SAMPLE[n] ?? {}, null, 2)); setOut(null); };
  const call = async () => { setBusy(true); setOut(null); try { setOut(await api(`/tools/${sel}`, { method: 'POST', body: { args: JSON.parse(args) } })); } catch (e) { setOut({ ok: false, error: e.message }); } finally { setBusy(false); } };
  const doms = data ? [...new Set(data.tools.map((t) => t.description.match(/^\[(\w+)\|/)?.[1]))] : [];
  return (
    <div className="page"><PageHead title="Alexa+ Lab" sub="Nexus exposes every capability as a self-hosted MCP server, the open standard behind Alexa+ integrations." />
      <section className="card glass"><div className="row wrap"><Plug size={20} style={{ color: 'var(--accent)' }} /><div className="grow"><strong>MCP server</strong><div className="muted small">Streamable HTTP · spec {status?.mcp?.protocol ?? '2025-11-25'} · bearer-token protected</div></div><span className="badge ok"><span className="dot ok" />{status?.mcp?.tools ?? '–'} tools live</span></div>
        <div className="mono" style={{ marginTop: 12, background: 'var(--bg)', padding: 12, borderRadius: 10, overflowX: 'auto' }}>POST {location.protocol}//{location.hostname}:8787/mcp<br />Authorization: Bearer &lt;MCP_AUTH_TOKEN from .env&gt;</div>
        <div className="small muted" style={{ marginTop: 8 }}>Stateless server: every request is a POST. Tools that change things only <i>propose</i> an action, and a person must approve it in Nexus. See README for exposing the endpoint to Alexa+ through a tunnel you control.</div></section>
      <div className="grid-2">
        <section className="card"><h2>Tools ({data?.tools.length ?? 0})</h2>{loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : <>
          <div className="row wrap" style={{ marginBottom: 10 }}>{doms.map((d) => <span key={d} className="badge">{d}</span>)}</div>
          <div className="list" style={{ maxHeight: 360, overflow: 'auto' }}>{data.tools.map((t) => <button key={t.name} onClick={() => pick(t.name)} style={{ all: 'unset', cursor: 'pointer', padding: '8px 2px', borderBottom: '1px solid var(--line)', display: 'block', color: sel === t.name ? 'var(--accent)' : undefined }}><div className="row"><span className="mono grow">{t.name}</span>{t.annotations?.readOnlyHint ? <span className="badge ok">read-only</span> : t.annotations?.destructiveHint ? <span className="badge warn"><ShieldCheck size={11} />needs approval</span> : <span className="badge">write</span>}</div><div className="small faint">{t.description.replace(/^\[[^\]]*\]\s*/, '')}</div></button>)}</div></>}</section>
        <section className="card"><h2>Try a tool over MCP</h2>
          <div className="stack"><div className="muted small">{tool ? tool.description.replace(/^\[[^\]]*\]\s*/, '') : 'Pick a tool.'}</div>
            <div className="field"><label htmlFor="ar">Arguments (JSON)</label><textarea id="ar" className="textarea mono" rows={5} value={args} onChange={(e) => setArgs(e.target.value)} spellCheck={false} /></div>
            <button className="btn primary" onClick={call} disabled={busy || !tool} style={{ justifySelf: 'start' }}>{busy ? <Spinner /> : <Play size={15} />}Call {sel}</button>
            {out && <pre className="diff" aria-live="polite">{JSON.stringify(out, null, 2).slice(0, 4000)}</pre>}</div></section>
      </div>
      <section className="card"><h2><Mic size={16} style={{ verticalAlign: -2 }} /> Simulated Alexa+ conversation</h2>
        <div className="muted small" style={{ marginBottom: 10 }}>Type what you'd say to Alexa+. Nexus routes it, calls the MCP tools through the same server, and replies.</div>
        <SimChat utter={utter} setUtter={setUtter} /></section>
    </div>
  );
}
function SimChat({ utter, setUtter }) {
  const { toast, tts, settings } = useApp(); const [log, setLog] = useState([]); const [busy, setBusy] = useState(false);
  const say = async (e) => {
    e.preventDefault(); const t = utter.trim(); if (!t || busy) return; setUtter(''); setBusy(true); setLog((l) => [...l, { who: 'You', text: t }]);
    try {
      const c = await api('/conversations', { method: 'POST' });
      let final = null; let tools = [];
      await streamChat(c.id, t, (ev) => { if (ev.type === 'tool') tools.push(ev.name); if (ev.type === 'final') final = ev; if (ev.type === 'error') toast(ev.message, 'bad'); });
      if (final) { setLog((l) => [...l, { who: 'Alexa+ (Nexus)', text: final.text, tools, pending: final.meta?.actions?.length }]); if (tts.supported) tts.speak('sim', final.text); }
    } catch (err) { toast(err.message, 'bad'); } finally { setBusy(false); }
  };
  return <div className="stack">
    <div className="stack" style={{ gap: 8 }} role="log" aria-live="polite">{log.map((m, i) => <div key={i} className="notice" style={m.who === 'You' ? { justifySelf: 'end', background: 'var(--accent-soft)' } : undefined}><div><div className="small faint">{m.who}{m.tools?.length ? ` · MCP: ${[...new Set(m.tools)].join(', ')}` : ''}</div><div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>{m.pending ? <div className="small" style={{ color: 'var(--warn)' }}>An action is waiting for approval in the Assistant page.</div> : null}</div></div>)}</div>
    <form className="row" onSubmit={say}><label htmlFor="sim" className="sr-only">Say something to Alexa+</label><input id="sim" className="input grow" placeholder="Alexa, what's my laptop's health?" value={utter} onChange={(e) => setUtter(e.target.value)} /><button className="btn primary" disabled={busy || !utter.trim()}>{busy ? <Spinner /> : 'Ask'}</button></form></div>;
}
