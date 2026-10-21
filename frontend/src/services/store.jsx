import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setCsrf } from './api.js';
import { useTTS } from '../hooks/useTTS.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [boot, setBoot] = useState({ loading: true, error: '' });
  const [toasts, setToasts] = useState([]);
  const [convs, setConvs] = useState([]);
  const [convQuery, setConvQuery] = useState('');

  const toast = useCallback((message, kind = '') => { const id = Math.random(); setToasts((t) => [...t, { id, message, kind }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500); }, []);
  const refreshStatus = useCallback(async () => { try { setStatus(await api('/status')); } catch { setStatus(null); } }, []);
  const refreshConvs = useCallback(async (q = convQuery) => { try { setConvs(await api(`/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`)); } catch { /* shown via boot/offline */ } }, [convQuery]);

  useEffect(() => { (async () => {
    try { const b = await fetch('/api/bootstrap', { credentials: 'include' }).then((r) => r.json()); setCsrf(b.csrfToken); setSettings(b.settings); setStatus(b.status); document.documentElement.dataset.theme = b.settings.theme; setBoot({ loading: false, error: '' }); refreshConvs(''); }
    catch { setBoot({ loading: false, error: 'Cannot reach the Nexus server. Start it with `npm start` and refresh.' }); }
  })(); const t = setInterval(refreshStatus, 30000); return () => clearInterval(t); }, []); // eslint-disable-line

  const saveSettings = useCallback(async (patch) => {
    setSettings((s) => ({ ...s, ...patch })); if (patch.theme) document.documentElement.dataset.theme = patch.theme;
    try { const s = await api('/settings', { method: 'PATCH', body: patch }); setSettings(s); if (patch.model) refreshStatus(); } catch (e) { toast(e.message, 'bad'); }
  }, [toast, refreshStatus]);

  const tts = useTTS(settings ?? {});
  const value = useMemo(() => ({ settings, saveSettings, status, refreshStatus, boot, toast, toasts, convs, refreshConvs, convQuery, setConvQuery, tts }), [settings, saveSettings, status, refreshStatus, boot, toast, toasts, convs, refreshConvs, convQuery, tts]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
