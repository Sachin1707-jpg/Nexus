import { useEffect, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { Mic, Volume2, Trash2, Check, X } from 'lucide-react';
import { api } from '../services/api.js';
import { useApp } from '../services/store.jsx';
import { PageHead, Switch, Modal, useAsync, Loading } from '../components/ui.jsx';

const Row = ({ title, hint, children }) => <div className="row" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}><div className="grow"><div>{title}</div>{hint && <div className="small muted">{hint}</div>}</div>{children}</div>;
export default function Settings() {
  const { settings, saveSettings, status, refreshStatus, tts, toast, refreshConvs } = useApp(); const [sp] = useSearchParams();
  const [model, setModel] = useState(settings.model); const [loc, setLoc] = useState(settings.location); const [name, setName] = useState(settings.userName); const [tz, setTz] = useState(settings.timezone); const [stt, setStt] = useState(localStorage.getItem('nx-stt') ?? 'browser'); const [confirm, setConfirm] = useState(false);
  const memories = useAsync(() => api('/memories'), []);
  useEffect(() => { const g = sp.get('google'); if (g === 'connected') { toast('Google connected', 'ok'); refreshStatus(); } else if (g) toast(g === 'denied' ? 'Google access was declined.' : 'Google sign-in failed. Check your OAuth settings.', 'bad'); }, []); // eslint-disable-line
  const connectGoogle = async () => { try { const r = await api('/auth/google/url'); window.location.href = r.url; } catch (e) { toast(e.message, 'bad'); } };
  const preview = () => tts.speak('preview', 'Hello, this is how I sound. Namaste, main aapki madad ke liye taiyaar hoon.');
  const wipe = async () => { await api('/data/conversations', { method: 'DELETE' }); setConfirm(false); refreshConvs(); toast('All conversations deleted', 'ok'); };
  const o = status?.ollama;
  return (
    <div className="page"><PageHead title="Settings" sub="Connections, voice, privacy and appearance. Secret values are never shown." />
      <div className="grid-2">
        <section className="card"><h2>Connections</h2>
          <Row title="Ollama" hint={o?.message}><span className={`badge ${o?.running && o?.modelInstalled ? 'ok' : 'bad'}`}>{o?.running ? (o.modelInstalled ? 'Ready' : 'Model missing') : 'Not running'}</span></Row>
          <Row title="Model" hint="Fast default: qwen3:4b with thinking off. Any installed Ollama model works."><form className="row" onSubmit={(e) => { e.preventDefault(); saveSettings({ model: model.trim() }); }}><input className="input" style={{ width: 150 }} aria-label="Model name" list="models" value={model} onChange={(e) => setModel(e.target.value)} /><datalist id="models">{(o?.models ?? []).map((m) => <option key={m} value={m} />)}</datalist><button className="btn sm">Save</button></form></Row>
          <Row title="Reasoning mode" hint="Slower but more careful. Leave off for speed."><Switch checked={settings.think} onChange={(v) => saveSettings({ think: v })} label="Enable model thinking" /></Row>
          <Row title="Google" hint={status?.google?.connected ? `Connected as ${status.google.email ?? 'your account'}` : status?.google?.configured ? 'Tasks, Calendar and Gmail' : 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first'}>{status?.google?.connected ? <button className="btn sm" onClick={async () => { await api('/auth/google', { method: 'DELETE' }); refreshStatus(); toast('Google disconnected', 'ok'); }}>Disconnect</button> : <button className="btn primary sm" onClick={connectGoogle} disabled={!status?.google?.configured}>Connect</button>}</Row>
          <Row title="GitHub" hint="Set GITHUB_TOKEN in .env (fine-grained, read-only to start)"><span className={`badge ${status?.github?.configured ? 'ok' : ''}`}>{status?.github?.configured ? 'Token set' : 'Not set'}</span></Row>
          <Row title="Local Whisper" hint={status?.whisper?.available ? `Running (${status.whisper.model})` : status?.whisper?.message}><span className={`badge ${status?.whisper?.available ? 'ok' : ''}`}>{status?.whisper?.available ? 'Running' : 'Optional'}</span></Row>
          <Row title="MCP server" hint={`Streamable HTTP, spec ${status?.mcp?.protocol}, ${status?.mcp?.tools} tools`}><span className="badge ok">Live</span></Row></section>
        <section className="card"><h2>General</h2>
          <div className="stack"><div className="field"><label htmlFor="nm">Your name</label><input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => saveSettings({ userName: name })} /></div>
            <div className="field"><label htmlFor="lc">Default location (for weather)</label><input id="lc" className="input" value={loc} onChange={(e) => setLoc(e.target.value)} onBlur={() => saveSettings({ location: loc })} placeholder="e.g. Lucknow" /></div>
            <div className="field"><label htmlFor="tz">Timezone</label><input id="tz" className="input" value={tz} onChange={(e) => setTz(e.target.value)} onBlur={() => saveSettings({ timezone: tz })} placeholder="Asia/Kolkata" /></div>
            <Row title="Light theme"><Switch checked={settings.theme === 'light'} onChange={(v) => saveSettings({ theme: v ? 'light' : 'dark' })} label="Light theme" /></Row></div></section>
        <section className="card"><h2><Mic size={16} style={{ verticalAlign: -2 }} /> Speech input</h2>
          <Row title="Engine" hint="Browser recognition is instant (Chrome/Edge, may use the browser vendor's service). Local Whisper keeps audio on this computer."><select className="select" style={{ width: 170 }} aria-label="Speech input engine" value={stt} onChange={(e) => { setStt(e.target.value); localStorage.setItem('nx-stt', e.target.value); }}><option value="browser">Browser</option><option value="local" disabled={!status?.whisper?.available}>Local Whisper{status?.whisper?.available ? '' : ' (not running)'}</option></select></Row>
          <Row title="Review text before sending" hint="Dictation fills the box so you can fix it first. Voice mode sends directly."><Switch checked={settings.reviewTranscript} onChange={(v) => saveSettings({ reviewTranscript: v })} label="Review transcript" /></Row></section>
        <section className="card"><h2><Volume2 size={16} style={{ verticalAlign: -2 }} /> Speech output</h2>
          {!tts.supported ? <div className="notice warn">This browser does not support speech synthesis.</div> : <>
            <Row title="Speak replies automatically"><Switch checked={settings.speakReplies} onChange={(v) => saveSettings({ speakReplies: v })} label="Speak replies" /></Row>
            <Row title="Read email and personal replies aloud" hint="Off by default for privacy."><Switch checked={settings.readSensitiveAloud} onChange={(v) => saveSettings({ readSensitiveAloud: v })} label="Read sensitive replies" /></Row>
            <div className="stack" style={{ marginTop: 12 }}><div className="field"><label htmlFor="vo">Voice</label><select id="vo" className="select" value={settings.voiceName} onChange={(e) => saveSettings({ voiceName: e.target.value })}><option value="">Automatic (Hindi/English)</option>{tts.voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}</select>{!tts.voices.some((v) => v.lang.startsWith('hi')) && <div className="small" style={{ color: 'var(--warn)' }}>No Hindi voice is installed, so Hindi will be read with an English voice. Add one in Windows Settings → Time & language → Speech.</div>}</div>
              {[['speechRate', 'Rate', 0.5, 2], ['speechPitch', 'Pitch', 0.5, 2], ['speechVolume', 'Volume', 0, 1]].map(([k, l, a, b]) => <div key={k} className="field"><label htmlFor={k}>{l}: {Number(settings[k]).toFixed(1)}</label><input id={k} type="range" min={a} max={b} step="0.1" value={settings[k]} onChange={(e) => saveSettings({ [k]: +e.target.value })} /></div>)}
              <div className="row"><button className="btn" onClick={preview}><Volume2 size={15} />Preview</button><button className="btn ghost" onClick={tts.stop}>Stop</button></div></div></>}</section>
        <section className="card"><h2>Privacy and memory</h2>
          <Row title="Save conversation history" hint="When off, new chats are removed when the server restarts."><Switch checked={settings.saveHistory} onChange={(v) => saveSettings({ saveHistory: v })} label="Save history" /></Row>
          <Row title="Delete chats older than" hint="0 keeps everything. Applied when the server starts."><select className="select" style={{ width: 130 }} aria-label="Retention" value={settings.retentionDays} onChange={(e) => saveSettings({ retentionDays: +e.target.value })}><option value={0}>Never</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></Row>
          <Row title="Delete all conversations"><button className="btn danger sm" onClick={() => setConfirm(true)}><Trash2 size={14} />Delete…</button></Row>
          <Row title="Privacy Policy" hint="Google Limited Use compliance, AI data disclosures, and storage details"><NavLink to="/privacy-policy" className="btn sm">Read Policy</NavLink></Row></section>
        <section className="card"><h2>Memories you asked Nexus to keep</h2>{memories.loading ? <Loading lines={2} /> : !memories.data?.length ? <div className="muted small">Nothing saved. Say “remember that…” in chat to add something.</div> : <div className="list">{memories.data.map((m) => <MemoryRow key={m.id} m={m} reload={memories.reload} />)}</div>}</section>
      </div>
      {confirm && <Modal title="Delete all conversations?" onClose={() => setConfirm(false)}><p>This permanently removes every conversation and message stored on this computer.</p><div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="btn danger" onClick={wipe}>Delete all</button></div></Modal>}
    </div>
  );
}
function MemoryRow({ m, reload }) { const [t, setT] = useState(m.content); const [ed, setEd] = useState(false); return <div className="row">{ed ? <input className="input grow" aria-label="Memory text" value={t} onChange={(e) => setT(e.target.value)} /> : <span className="grow">{m.content}</span>}{ed ? <><button className="btn sm" onClick={async () => { await api(`/memories/${m.id}`, { method: 'PATCH', body: { content: t } }); setEd(false); reload(); }}><Check size={14} /></button><button className="btn sm ghost" onClick={() => setEd(false)}><X size={14} /></button></> : <><button className="btn sm ghost" onClick={() => setEd(true)}>Edit</button><button className="btn sm ghost" aria-label="Delete memory" onClick={async () => { await api(`/memories/${m.id}`, { method: 'DELETE' }); reload(); }}><Trash2 size={14} /></button></>}</div>; }
