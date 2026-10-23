import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, CheckSquare, CalendarDays, Mail, CloudSun, HeartHandshake, Activity, GitBranch as Github, Plug, Settings, Plus, Search, Menu, PanelLeftClose, PanelLeft, Sun, Moon, Trash2, Command } from 'lucide-react';
import { useApp } from '../services/store.jsx';
import { api } from '../services/api.js';

const NAV = [
  ['/', 'Overview', LayoutDashboard], ['/assistant', 'Assistant', MessageSquare], ['/tasks', 'Tasks', CheckSquare], ['/calendar', 'Calendar', CalendarDays], ['/email', 'Email', Mail],
  ['/weather', 'Weather', CloudSun], ['/insights', 'My Insights', HeartHandshake], ['/system', 'System Health', Activity], ['/github', 'GitHub', Github], ['/alexa', 'Alexa+ Lab', Plug], ['/settings', 'Settings', Settings],
];
const TITLES = Object.fromEntries(NAV.map(([p, t]) => [p, t]));

export default function Layout() {
  const { settings, saveSettings, status, convs, refreshConvs, convQuery, setConvQuery } = useApp();
  const [mini, setMini] = useState(() => localStorage.getItem('nx-mini') === '1');
  const [open, setOpen] = useState(false); const [pal, setPal] = useState(false);
  const loc = useLocation(); const nav = useNavigate();
  useEffect(() => { setOpen(false); }, [loc.pathname, loc.search]);
  useEffect(() => { localStorage.setItem('nx-mini', mini ? '1' : '0'); }, [mini]);
  useEffect(() => { const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal(true); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  useEffect(() => { const t = setTimeout(() => refreshConvs(convQuery), 250); return () => clearTimeout(t); }, [convQuery]); // eslint-disable-line

  const newChat = async () => { const c = await api('/conversations', { method: 'POST' }); await refreshConvs(); nav(`/assistant?c=${c.id}`); };
  const del = async (id, e) => { e.stopPropagation(); await api(`/conversations/${id}`, { method: 'DELETE' }); await refreshConvs(); if (loc.search.includes(id)) nav('/assistant'); };
  const activeConv = new URLSearchParams(loc.search).get('c');
  const title = TITLES[loc.pathname] ?? 'Nexus';
  const ok = status?.ollama?.running && status?.ollama?.modelInstalled;

  return (
    <div className={`app ${mini ? 'mini' : ''}`}>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Primary">
        <div className="brand"><div className="brand-mark" aria-hidden /><span>Nexus</span></div>
        <div className="side-scroll">
          <button className="btn primary" onClick={newChat} style={{ justifyContent: 'center' }}><Plus size={16} /><span className="txt">New conversation</span></button>
          <nav className="nav" aria-label="Pages">{NAV.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'} title={label}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
          <div className="conv-block">
            <div className="launcher" style={{ minWidth: 0 }}><Search size={14} /><input aria-label="Search conversations" placeholder="Search chats" value={convQuery} onChange={(e) => setConvQuery(e.target.value)} style={{ background: 'none', border: 0, outline: 'none', width: '100%' }} /></div>
            <div className="conv-list">
              {convs.length === 0 && <div className="faint small" style={{ padding: '6px 10px' }}>{convQuery ? 'No matching chats.' : 'No conversations yet.'}</div>}
              {convs.map((c) => <div key={c.id} className={`conv-item ${activeConv === c.id ? 'active' : ''}`} onClick={() => nav(`/assistant?c=${c.id}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/assistant?c=${c.id}`)}><span className="t">{c.title}</span><button className="x btn ghost icon-btn sm" onClick={(e) => del(c.id, e)} aria-label={`Delete conversation ${c.title}`}><Trash2 size={14} /></button></div>)}
            </div>
          </div>
        </div>
        <div className="side-foot">
          <div className="status-line" title={status?.ollama?.message}><span className={`dot ${ok ? 'ok' : 'bad'}`} /><span className="txt">{status ? (ok ? `${status.ollama.model} ready` : status.ollama.message) : 'Server offline'}</span></div>
          <div className="row"><button className="btn icon-btn sm" onClick={() => saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })} aria-label="Toggle theme">{settings?.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
            <button className="btn icon-btn sm collapse-btn" onClick={() => setMini(!mini)} aria-label={mini ? 'Expand sidebar' : 'Collapse sidebar'}>{mini ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}</button>
            <NavLink to="/privacy-policy" className="faint small" style={{ marginLeft: 'auto', textDecoration: 'none' }} title="Privacy Policy">Privacy</NavLink>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="btn ghost icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={18} /></button>
          <h1>{title}</h1><span className="ctx">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span><div className="grow" />
          <button className="launcher" onClick={() => setPal(true)} aria-label="Open command launcher"><Command size={14} /><span className="lbl">Search or jump to…</span><kbd>Ctrl K</kbd></button>
          <span className="badge" title="Google"><span className={`dot ${status?.google?.connected ? 'ok' : ''}`} />Google</span>
          <span className="badge" title="GitHub"><span className={`dot ${status?.github?.configured ? 'ok' : ''}`} />GitHub</span>
        </header>
        <main className="content" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1 }}><Outlet /></div>
          <footer className="app-footer">
            <div>&copy; {new Date().getFullYear()} Nexus Workspace &bull; AI Personal Workspace Assistant</div>
            <nav className="footer-nav" aria-label="Footer links">
              <NavLink to="/privacy-policy">Privacy Policy</NavLink>
              <NavLink to="/settings">Settings</NavLink>
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google User Data Policy</a>
            </nav>
          </footer>
        </main>
      </div>
      {pal && <Palette onClose={() => setPal(false)} nav={nav} newChat={newChat} />}
    </div>
  );
}

function Palette({ onClose, nav, newChat }) {
  const [q, setQ] = useState(''); const [sel, setSel] = useState(0); const { convs } = useApp();
  const items = useMemo(() => [
    { label: 'New conversation', run: newChat },
    ...NAV.map(([to, t]) => ({ label: `Go to ${t}`, run: () => nav(to) })),
    { label: 'Go to Privacy Policy', run: () => nav('/privacy-policy') },
    ...convs.slice(0, 15).map((c) => ({ label: `Chat: ${c.title}`, run: () => nav(`/assistant?c=${c.id}`) }))
  ].filter((i) => i.label.toLowerCase().includes(q.toLowerCase())), [q, convs, nav, newChat]);
  const go = (i) => { i?.run(); onClose(); };
  return <div className="palette-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="palette" role="dialog" aria-label="Command launcher">
    <input autoFocus placeholder="Type to search pages and chats" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); } if (e.key === 'Enter') go(items[sel]); }} aria-label="Search" />
    <ul>{items.length === 0 && <li className="faint" style={{ padding: 14 }}>Nothing matches “{q}”.</li>}{items.map((i, n) => <li key={i.label}><button className={n === sel ? 'sel' : ''} onClick={() => go(i)}>{i.label}</button></li>)}</ul></div></div>;
}
