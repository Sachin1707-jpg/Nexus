import { useState } from 'react';
import { Search, Send, FilePen, Mail as MailIcon } from 'lucide-react';
import { callTool } from '../services/api.js';
import { useApp } from '../services/store.jsx';
import { useAsync, Loading, Empty, IntegrationGate, PageHead, Spinner } from '../components/ui.jsx';
import ActionCard from '../components/ActionCard.jsx';

export default function Email() {
  const { toast } = useApp(); const [q, setQ] = useState('in:inbox'); const [applied, setApplied] = useState('in:inbox'); const [thread, setThread] = useState(null); const [tl, setTl] = useState(false);
  const [c, setC] = useState({ to: '', subject: '', body: '' }); const [pend, setPend] = useState(null); const [busy, setBusy] = useState(false); const [draftNote, setDraftNote] = useState('');
  const { loading, data, error, reload } = useAsync(async () => { const r = await callTool('gmail_search', { query: applied, max: 15 }); if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code }); return r.data.emails; }, [applied]);
  const open = async (m) => { setTl(true); setThread({ subject: m.subject, messages: [] }); const r = await callTool('gmail_read_thread', { threadId: m.threadId }); setTl(false); if (r.ok) setThread({ subject: m.subject, messages: r.data.messages }); else { toast(r.error, 'bad'); setThread(null); } };
  const propose = async () => { setBusy(true); const r = await callTool('gmail_propose_send', c); setBusy(false); if (r.pendingActionsView) setPend(r.pendingActionsView[0]); else toast(r.question ?? r.error, 'bad'); };
  const draft = async () => { setBusy(true); const r = await callTool('gmail_create_draft', c); setBusy(false); if (r.ok) { setDraftNote('Saved to your Gmail drafts (not sent).'); toast('Draft saved in Gmail', 'ok'); } else toast(r.question ?? r.error, 'bad'); };
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.to) && c.subject.trim() && c.body.trim();
  return (
    <div className="page"><PageHead title="Email" sub="Gmail. Nothing is sent until you approve the exact message." />
      <div className="grid-2">
        <section className="card"><form className="row" onSubmit={(e) => { e.preventDefault(); setApplied(q); }}><div className="launcher grow" style={{ minWidth: 0 }}><Search size={14} /><input aria-label="Search email" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, e.g. from:faculty newer_than:7d" style={{ background: 'none', border: 0, outline: 'none', width: '100%' }} /></div><button className="btn">Search</button></form>
          <div style={{ marginTop: 12 }}>{loading ? <Loading lines={5} /> : error ? <IntegrationGate error={error} onRetry={reload} what="email" /> : !data.length ? <Empty icon={MailIcon} title="No messages match">Try a different search.</Empty> :
            <div className="list">{data.map((m) => <button key={m.id} onClick={() => open(m)} style={{ all: 'unset', cursor: 'pointer', padding: '11px 2px', borderBottom: '1px solid var(--line)', display: 'block' }}><div className="row"><strong className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(no subject)'}</strong><span className="faint small">{m.date?.slice(0, 16)}</span></div><div className="small muted">{m.from}</div><div className="small faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.snippet}</div></button>)}</div>}</div></section>
        <section className="card"><h2>Compose</h2><div className="stack">
          <div className="field"><label htmlFor="to">To (exact address)</label><input id="to" className="input" type="email" value={c.to} onChange={(e) => setC({ ...c, to: e.target.value })} placeholder="name@example.com" /></div>
          <div className="field"><label htmlFor="su">Subject</label><input id="su" className="input" value={c.subject} onChange={(e) => setC({ ...c, subject: e.target.value })} /></div>
          <div className="field"><label htmlFor="bo">Message</label><textarea id="bo" className="textarea" rows={9} value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} /></div>
          <div className="small muted">Tip: ask Nexus in the Assistant to draft this for you, then edit it here.</div>
          {draftNote && <div className="small" style={{ color: 'var(--ok)' }}>{draftNote}</div>}
          <div className="row"><button className="btn" onClick={draft} disabled={!valid || busy}><FilePen size={15} />Save draft</button><button className="btn primary" onClick={propose} disabled={!valid || busy}>{busy ? <Spinner /> : <Send size={15} />}Review and send</button></div>
          {pend && <ActionCard action={pend} onChange={(a) => { setPend(a); if (a.executionStatus === 'succeeded') setC({ to: '', subject: '', body: '' }); }} />}</div></section>
      </div>
      {thread && <section className="card"><div className="row"><h2 className="grow">{thread.subject || 'Thread'}</h2><button className="btn sm" onClick={() => setThread(null)}>Close</button></div>{tl ? <Loading /> : <div className="stack">{thread.messages.map((m) => <div key={m.id} className="card" style={{ background: 'var(--bg-2)' }}><div className="small muted">{m.from} · {m.date}</div><div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{m.body || '(no text content)'}</div></div>)}<div className="small muted">To summarise this thread, ask Nexus in the Assistant.</div></div>}</section>}
    </div>
  );
}
