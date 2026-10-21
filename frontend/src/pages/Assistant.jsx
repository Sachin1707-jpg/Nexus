import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Send, Square, Mic, Volume2, Pause, Play, Copy, RotateCcw, AudioLines, X, Check, VolumeX } from 'lucide-react';
import { api, streamChat } from '../services/api.js';
import { useApp } from '../services/store.jsx';
import { useDictation } from '../hooks/useDictation.js';
import Markdown from '../components/Markdown.jsx';
import ActionCard from '../components/ActionCard.jsx';
import { ErrorBox } from '../components/ui.jsx';
import '../styles/chat.css';

const SUGGEST = [
  ['Plan my day', 'What tasks and meetings do I have today?'], ['Add a task', 'Kal assignment submit karna hai, task bana do.'],
  ['Outing check', 'Kal kahin ghoomne jaa sakti hoon?'], ['Laptop check-up', 'Mere laptop mein kya problem chal rahi hai?'],
  ['Review code', 'Check my GitHub project for bugs.'], ['Just talk', 'I am feeling low today. Can we talk?'],
];
const SENSITIVE = (m) => m?.meta?.domains?.includes('gmail') || m?.meta?.support;
export const sttEngine = () => localStorage.getItem('nx-stt') ?? 'browser';

export default function Assistant() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const loc = useLocation();
  const { settings, tts, refreshConvs, toast, status } = useApp();
  const convId = sp.get('c');
  const [msgs, setMsgs] = useState([]); const [actions, setActions] = useState({});
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [activity, setActivity] = useState(''); const [stream, setStream] = useState('');
  const [error, setError] = useState(null); const [voice, setVoice] = useState(false); const [handsFree, setHandsFree] = useState(false);
  const endRef = useRef(null); const abortRef = useRef(null); const sending = useRef(false); const taRef = useRef(null); const lastUser = useRef('');
  const voiceRef = useRef({ voice, handsFree }); voiceRef.current = { voice, handsFree };
  const [voiceReply, setVoiceReply] = useState('');

  const loadActions = useCallback(async (list) => {
    const ids = list.flatMap((m) => m.meta?.actions ?? []); const out = {};
    await Promise.all(ids.map(async (id) => { try { out[id] = await api(`/actions/${id}`); } catch { /* not visible */ } }));
    setActions((a) => ({ ...a, ...out }));
  }, []);
  useEffect(() => { setError(null); setStream(''); tts.stop(); if (!convId) { setMsgs([]); return; }
    api(`/conversations/${convId}/messages`).then((r) => { setMsgs(r.messages); loadActions(r.messages); }).catch((e) => setError(e)); }, [convId]); // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, stream, activity, actions]);
  useEffect(() => { const ta = taRef.current; if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`; } }, [text]);

  const send = useCallback(async (raw) => {
    const t = (raw ?? text).trim(); if (!t || sending.current) return;
    sending.current = true; setBusy(true); setError(null); setText(''); setStream(''); setActivity('Thinking'); lastUser.current = t; tts.stop();
    let id = convId;
    try {
      if (!id) { const c = await api('/conversations', { method: 'POST' }); id = c.id; nav(`/assistant?c=${id}`, { replace: true }); }
      setMsgs((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: t }]);
      const ac = new AbortController(); abortRef.current = ac; let final = null; let acc = '';
      await streamChat(id, t, (ev) => {
        if (ev.type === 'status') { setActivity(ev.message); setStream(''); /* clear stale tokens during tool steps */ }
        else if (ev.type === 'stream_reset') { acc = ''; setStream(''); } // backend: real answer starts now
        else if (ev.type === 'token') { acc += ev.text; setStream(acc); }
        else if (ev.type === 'action') setActions((a) => ({ ...a, [ev.action.id]: ev.action }));
        else if (ev.type === 'final') final = ev;
        else if (ev.type === 'error') setError(new Error(ev.message));
      }, ac.signal);
      if (final) {
        setMsgs((m) => [...m, { id: final.messageId ?? `a${Date.now()}`, role: 'assistant', content: final.text, meta: final.meta }]);
        const speakIt = (settings.speakReplies || voiceRef.current.voice) && tts.supported && (!SENSITIVE({ meta: final.meta }) || settings.readSensitiveAloud);
        setVoiceReply(final.text);
        if (speakIt) tts.speak(final.messageId ?? 'last', final.text, { onEnd: () => { if (voiceRef.current.voice && voiceRef.current.handsFree) setTimeout(() => dictRef.current?.start(sttEngine()), 300); } });
        else if (voiceRef.current.voice && voiceRef.current.handsFree && !final.meta?.actions?.length) setTimeout(() => dictRef.current?.start(sttEngine()), 300);
      }
      refreshConvs();
    } catch (e) { if (e.name !== 'AbortError') setError(e); }
    finally { sending.current = false; setBusy(false); setActivity(''); setStream(''); abortRef.current = null; }
  }, [text, convId, nav, settings, tts, refreshConvs]);

  useEffect(() => { if (loc.state?.prefill) { setText(loc.state.prefill); nav(loc.pathname + loc.search, { replace: true, state: null }); } }, []); // eslint-disable-line
  const dictRef = useRef(null);
  const onVoiceText = useCallback((t) => {
    if (voiceRef.current.voice || !settings.reviewTranscript) send(t);
    else { setText((x) => (x ? `${x} ${t}` : t)); taRef.current?.focus(); }
  }, [send, settings.reviewTranscript]);
  const dict = useDictation({ onResult: onVoiceText, lang: 'en-IN' }); dictRef.current = dict;
  useEffect(() => { if (dict.error) toast(dict.error, 'bad'); }, [dict.error]); // eslint-disable-line

  const stop = () => { abortRef.current?.abort(); };
  const toggleMic = () => { if (dict.status === 'listening') dict.stop(); else { tts.stop(); dict.start(sttEngine()); } };
  const retry = () => { if (lastUser.current) send(lastUser.current); };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied', 'ok'); } catch { toast('Copy is blocked by the browser.', 'bad'); } };
  const ollamaDown = status && !status.ollama?.running;
  const empty = msgs.length === 0 && !busy;
  const orbState = dict.status === 'listening' ? 'live' : busy ? 'thinking' : tts.state.status === 'speaking' ? 'live speaking' : '';
  const voiceLabel = dict.status === 'listening' ? 'Listening…' : dict.status === 'transcribing' ? 'Transcribing…' : busy ? (activity || 'Thinking…') : tts.state.status === 'speaking' ? 'Speaking…' : 'Tap the mic to talk';

  return (
    <div className="chat">
      <div className="thread" role="log" aria-live="polite" aria-label="Conversation">
        <div className="thread-in">
          {ollamaDown && <div className="notice warn" role="alert"><span>{status.ollama.message}</span></div>}
          {status?.ollama?.running && !status.ollama.modelInstalled && <div className="notice warn" role="alert"><span>{status.ollama.message}</span></div>}
          {empty && <div className="welcome"><div className="orb" aria-hidden /><div><h1 style={{ fontSize: 26 }}>{settings.userName ? `Hi ${settings.userName}, what shall we do?` : 'What shall we do today?'}</h1><p className="muted" style={{ marginTop: 6 }}>Ask in English or Hinglish. Anything that changes something asks you first.</p></div>
            <div className="suggest">{SUGGEST.map(([h, p]) => <button key={h} onClick={() => send(p)}><b>{h}</b><span>{p}</span></button>)}</div></div>}
          {msgs.map((m) => m.role === 'user' ? <div key={m.id} className="msg user"><div className="bubble">{m.content}</div></div> : (
            <div key={m.id} className="msg assistant">
              <div className="who"><span className="mini-orb" aria-hidden />Nexus
                {m.meta?.tools?.length > 0 && <span className="badge">{[...new Set(m.meta.tools.map((t) => t.name.split('_')[0]))].join(', ')}</span>}
                <span className="msg-tools">
                  {tts.supported && (tts.state.id === m.id && tts.state.status !== 'idle'
                    ? <>{tts.state.status === 'speaking' ? <button className="btn ghost icon-btn sm" onClick={tts.pause} aria-label="Pause speech"><Pause size={14} /></button> : <button className="btn ghost icon-btn sm" onClick={tts.resume} aria-label="Resume speech"><Play size={14} /></button>}<button className="btn ghost icon-btn sm" onClick={tts.stop} aria-label="Stop speech"><Square size={14} /></button></>
                    : <button className="btn ghost icon-btn sm" onClick={() => tts.speak(m.id, m.content)} aria-label="Speak this reply"><Volume2 size={14} /></button>)}
                  <button className="btn ghost icon-btn sm" onClick={() => copy(m.content)} aria-label="Copy reply"><Copy size={14} /></button>
                </span></div>
              <div className="body"><Markdown>{m.content}</Markdown></div>
              {(m.meta?.actions ?? []).map((id) => actions[id] && <ActionCard key={id} action={actions[id]} onChange={(a) => setActions((s) => ({ ...s, [id]: a }))} />)}
            </div>))}
          {busy && <div className="msg assistant"><div className="who"><span className="mini-orb" aria-hidden />Nexus</div>
            {stream ? <div className="body"><Markdown>{stream}</Markdown></div> : <div className="activity" role="status"><span className="pulse" />{activity}…</div>}
            {Object.values(actions).filter((a) => a.approvalStatus === 'pending' && !msgs.some((m) => m.meta?.actions?.includes(a.id))).map((a) => <ActionCard key={a.id} action={a} onChange={(x) => setActions((s) => ({ ...s, [a.id]: x }))} />)}</div>}
          {error && <ErrorBox error={error} onRetry={lastUser.current ? retry : undefined}>{error.code === 'ollama_down' ? 'Open the Ollama app or run `ollama serve`.' : error.code === 'model_missing' ? 'Install the model, then retry.' : ''}</ErrorBox>}
          <div ref={endRef} />
        </div>
      </div>

      <div className="composer-wrap">
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label htmlFor="msg" className="sr-only">Message Nexus</label>
          <textarea id="msg" ref={taRef} rows={1} value={dict.interim ? `${text} ${dict.interim}`.trim() : text} onChange={(e) => setText(e.target.value)} placeholder={dict.status === 'listening' ? 'Listening…' : 'Ask Nexus anything, in English or Hinglish'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} disabled={dict.status === 'transcribing'} />
          <div className="composer-row">
            <button type="button" className={`btn icon-btn ${dict.status === 'listening' ? 'mic-live' : ''}`} onClick={toggleMic} disabled={dict.status === 'transcribing'} aria-label={dict.status === 'listening' ? 'Stop recording' : 'Start voice input'} aria-pressed={dict.status === 'listening'}><Mic size={17} /></button>
            {dict.status === 'listening' && <button type="button" className="btn ghost sm" onClick={dict.cancel}>Cancel</button>}
            {dict.status === 'transcribing' && <span className="hint">Transcribing…</span>}
            {dict.status === 'idle' && <span className="hint">Enter to send, Shift+Enter for a new line</span>}
            <div className="grow" />
            <button type="button" className="btn icon-btn" onClick={() => { setVoice(true); setVoiceReply(''); }} aria-label="Open voice mode" title="Voice mode"><AudioLines size={17} /></button>
            {busy ? <button type="button" className="btn icon-btn" onClick={stop} aria-label="Stop generating"><Square size={16} /></button>
              : <button className="btn primary icon-btn" type="submit" disabled={!text.trim() || dict.status !== 'idle'} aria-label="Send message"><Send size={16} /></button>}
          </div>
        </form>
      </div>

      {voice && <div className="voice-panel" role="dialog" aria-label="Voice mode">
        <div className="row"><strong className="grow">Voice mode</strong>
          <label className="row small muted"><span>Hands-free</span><span className="switch"><input type="checkbox" role="switch" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} aria-label="Hands-free: listen again after each reply" /><span /></span></label>
          <button className="btn ghost icon-btn" onClick={() => { dict.cancel(); tts.stop(); abortRef.current?.abort(); setVoice(false); setHandsFree(false); }} aria-label="Close voice mode"><X size={18} /></button></div>
        <div className="voice-body">
          <div className={`orb ${orbState}`} aria-hidden style={{ width: 150, height: 150 }} />
          <div role="status" aria-live="polite" className="muted">{voiceLabel}</div>
          <div className="voice-transcript">{dict.interim || (msgs.filter((m) => m.role === 'user').at(-1)?.content ?? '')}</div>
          <div className="voice-reply"><Markdown>{voiceReply}</Markdown></div>
          {Object.values(actions).some((a) => a.approvalStatus === 'pending') && <div className="notice warn small" role="alert">Nexus prepared an action and nothing has changed yet. Spoken commands can't approve it: close voice mode and review the approval card.</div>}
          {error && <div className="small" style={{ color: 'var(--bad)' }}>{error.message}</div>}
        </div>
        <div className="row" style={{ justifyContent: 'center', paddingBottom: 8 }}>
          <button className={`btn icon-btn ${dict.status === 'listening' ? 'mic-live' : ''}`} style={{ width: 64, height: 64, borderRadius: 32 }} onClick={toggleMic} disabled={busy || dict.status === 'transcribing'} aria-label={dict.status === 'listening' ? 'Stop and send' : 'Start listening'}><Mic size={26} /></button>
          {(busy || tts.state.status !== 'idle') && <button className="btn" onClick={() => { tts.stop(); stop(); }}><Square size={14} />Interrupt</button>}
          {tts.supported && tts.state.status === 'idle' && voiceReply && <button className="btn" onClick={() => tts.speak('voice', voiceReply)}><Volume2 size={14} />Replay</button>}
        </div>
      </div>}
    </div>
  );
}
