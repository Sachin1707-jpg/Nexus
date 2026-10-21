import { useState } from 'react';
import { RefreshCw, ShieldCheck, FolderSearch, Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { callTool } from '../services/api.js';
import { useAsync, Loading, Empty, ErrorBox, PageHead } from '../components/ui.jsx';
import ActionCard from '../components/ActionCard.jsx';
import { useApp } from '../services/store.jsx';
import { fmtBytes } from '../services/format.js';

const Meter = ({ pct, label, sub, Icon }) => { const c = pct >= 90 ? 'var(--bad)' : pct >= 75 ? 'var(--warn)' : 'var(--accent)'; return <div className="card"><div className="row"><Icon size={16} className="faint" /><span className="grow muted">{label}</span><strong>{pct == null ? 'n/a' : `${pct}%`}</strong></div><div style={{ height: 8, background: 'var(--line)', borderRadius: 6, margin: '10px 0 6px', overflow: 'hidden' }} role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={label}><div style={{ width: `${pct ?? 0}%`, height: '100%', background: c, transition: 'width .4s' }} /></div><div className="small faint">{sub}</div></div>; };
export default function System() {
  const { status } = useApp(); const [dir, setDir] = useState(''); const [files, setFiles] = useState(null); const [ferr, setFerr] = useState(''); const [sel, setSel] = useState([]); const [pend, setPend] = useState(null); const [busy, setBusy] = useState(false);
  const { loading, data, error, reload } = useAsync(async () => { const r = await callTool('system_maintenance_recommendations'); if (!r.ok) throw new Error(r.error); return r.data; }, []);
  const procs = useAsync(async () => { const r = await callTool('system_list_processes', { sortBy: 'memory', limit: 10 }); if (!r.ok) throw new Error(r.error); return r.data; }, []);
  const find = async () => { setBusy(true); setFerr(''); setFiles(null); setSel([]); const r = await callTool('system_find_large_files', { dir, minMB: 100, limit: 25 }); setBusy(false); if (r.ok) setFiles(r.data); else setFerr(r.error); };
  const propose = async (name, args) => { const r = await callTool(name, args); if (r.pendingActionsView) setPend(r.pendingActionsView[0]); else setFerr(r.error ?? r.question); };
  const h = data?.health;
  return (
    <div className="page"><PageHead title="System Health" sub="Read-only monitoring runs freely. Deleting files or stopping programs always needs your approval."><button className="btn" onClick={() => { reload(); procs.reload(); }}><RefreshCw size={15} />Refresh</button></PageHead>
      {loading ? <div className="card"><Loading lines={4} /></div> : error ? <ErrorBox error={error} onRetry={reload} /> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
          <Meter Icon={Cpu} label="CPU" pct={h.cpu.usagePct} sub={`${h.cpu.cores} cores · ${h.cpu.model}`} />
          <Meter Icon={MemoryStick} label="Memory" pct={h.memory.usedPct} sub={`${fmtBytes(h.memory.totalBytes - h.memory.freeBytes)} of ${fmtBytes(h.memory.totalBytes)} used`} />
          {(h.disks ?? []).map((d) => <Meter key={d.drive} Icon={HardDrive} label={`Drive ${d.drive}`} pct={d.usedPct} sub={`${fmtBytes(d.freeBytes)} free of ${fmtBytes(d.totalBytes)}`} />)}
          {!h.disks && <div className="card"><div className="muted">Disk metrics are unavailable on this system.</div></div>}</div>
        <section className="card"><h2>Recommendations</h2><div className="stack" style={{ gap: 8 }}>{data.recommendations.map((r, i) => <div key={i} className={`notice ${r.level === 'warn' ? 'warn' : r.level === 'ok' ? 'ok' : ''}`}><span>{r.text}</span></div>)}</div><div className="faint small" style={{ marginTop: 8 }}>{h.platform} · up {h.uptimeHours} h · measured {new Date(h.collectedAt).toLocaleTimeString()}</div></section></>}
      <div className="grid-2">
        <section className="card"><h2>Top processes by memory</h2>{procs.loading ? <Loading /> : procs.error ? <ErrorBox error={procs.error} onRetry={procs.reload} /> : <table className="tbl"><thead><tr><th>Process</th><th>PID</th><th>Memory</th><th /></tr></thead><tbody>{procs.data.top.map((p) => <tr key={p.pid}><td>{p.name}</td><td className="mono">{p.pid}</td><td>{fmtBytes(p.memoryBytes)}</td><td><button className="btn sm danger" onClick={() => propose('system_propose_kill_process', { pid: p.pid, name: p.name })}>Stop…</button></td></tr>)}</tbody></table>}</section>
        <section className="card"><h2>Find large files</h2>{status && status.approvedDirs === 0 ? <div className="notice warn"><ShieldCheck size={18} /><span>No folders are approved yet. Add folders to <span className="mono">APPROVED_DIRS</span> in <span className="mono">.env</span> (separate with semicolons), then restart. Nexus never looks outside them.</span></div> : <>
          <form className="row" onSubmit={(e) => { e.preventDefault(); find(); }}><input className="input grow" aria-label="Approved folder path" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="C:\Users\you\Downloads" /><button className="btn primary" disabled={!dir || busy}><FolderSearch size={15} />Scan</button></form></>}
          {ferr && <div className="notice bad" style={{ marginTop: 10 }} role="alert">{ferr}</div>}
          {files && (files.files.length ? <><div className="faint small" style={{ margin: '10px 0' }}>Scanned {files.scanned} items{files.truncated ? ' (stopped at the scan limit)' : ''}. Files of 100 MB or more:</div><div className="list">{files.files.map((f) => <label key={f.path} className="row"><input type="checkbox" checked={sel.includes(f.path)} onChange={(e) => setSel(e.target.checked ? [...sel, f.path] : sel.filter((x) => x !== f.path))} /><span className="grow mono" style={{ wordBreak: 'break-all' }}>{f.path}</span><span className="badge">{fmtBytes(f.sizeBytes)}</span></label>)}</div><button className="btn danger" style={{ marginTop: 10 }} disabled={!sel.length} onClick={() => propose('system_propose_delete_files', { paths: sel })}>Review deletion of {sel.length} file{sel.length === 1 ? '' : 's'}…</button></> : <Empty title="No files of 100 MB or more here" />)}</section>
      </div>
      {pend && <ActionCard action={pend} onChange={(a) => { setPend(a); if (a.executionStatus === 'succeeded') { setFiles(null); procs.reload(); reload(); } }} />}
    </div>
  );
}
