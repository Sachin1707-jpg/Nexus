import { useEffect, useState } from 'react';
import { Search, MapPin, Droplets, Wind, Umbrella } from 'lucide-react';
import { api, callTool } from '../services/api.js';
import { useApp } from '../services/store.jsx';
import { Loading, Empty, ErrorBox, PageHead } from '../components/ui.jsx';
import { fmtDate, todayStr, addDays } from '../services/format.js';

export default function Weather() {
  const { settings, saveSettings } = useApp(); const [q, setQ] = useState(settings.location ?? ''); const [place, setPlace] = useState(settings.location ?? '');
  const [state, setState] = useState({ loading: false, data: null, error: null, q: null }); const [date, setDate] = useState(addDays(todayStr(settings.timezone), 1)); const [adv, setAdv] = useState(null);
  const load = async (name) => { if (!name) return; setState({ loading: true, data: null, error: null }); setAdv(null); try { const r = await callTool('weather_forecast', { location: name }); if (!r.ok) throw new Error(r.question ?? r.error); setState({ loading: false, data: r.data, error: null }); } catch (e) { setState({ loading: false, data: null, error: e }); } };
  useEffect(() => { load(place); }, [place]); // eslint-disable-line
  const advise = async () => { setAdv({ loading: true }); const r = await callTool('weather_outing_advice', { location: place, date }); setAdv(r.ok ? r.data : { error: r.question ?? r.error }); };
  const d = state.data; const maxT = d ? Math.max(...d.daily.map((x) => x.tMax)) : 0; const minT = d ? Math.min(...d.daily.map((x) => x.tMin)) : 0;
  const A = adv?.assessment; const lvl = { good: ['ok', 'Good for an outing'], fair: ['warn', 'Possible, with caveats'], poor: ['bad', 'Not a good day'] }[A?.level];
  return (
    <div className="page"><PageHead title="Weather" sub="Forecast data from Open-Meteo. Advice is a rule-based reading of that data, not a safety guarantee.">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPlace(q.trim()); }}><div className="launcher" style={{ minWidth: 0 }}><Search size={14} /><input aria-label="Search location" value={q} onChange={(e) => setQ(e.target.value)} placeholder="City name" style={{ background: 'none', border: 0, outline: 'none' }} /></div><button className="btn">Search</button>{place && place !== settings.location && <button type="button" className="btn ghost" onClick={() => saveSettings({ location: place })}>Set as default</button>}</form></PageHead>
      {!place ? <div className="card"><Empty icon={MapPin} title="Search for a city">Or set a default location so Nexus can answer “kal ghoomne jaa sakti hoon?”.</Empty></div> : state.loading ? <div className="card"><Loading lines={4} /></div> : state.error ? <ErrorBox error={state.error} onRetry={() => load(place)} /> : d && <>
        <section className="card glass"><div className="row wrap"><div><div className="muted"><MapPin size={14} style={{ verticalAlign: -2 }} /> {d.place.name}{d.place.region ? `, ${d.place.region}` : ''}, {d.place.country}</div><div style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.1 }}>{Math.round(d.current.temperature_2m)}°C</div><div className="muted">{d.current.summary}, feels like {Math.round(d.current.apparent_temperature)}°</div></div><div className="grow" />
          <div className="row wrap"><span className="badge"><Droplets size={13} />Humidity {d.current.relative_humidity_2m}%</span><span className="badge"><Wind size={13} />Wind {d.current.wind_speed_10m} km/h</span></div></div></section>
        <section className="card"><h2>7-day forecast</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(112px,1fr))', gap: 10 }}>{d.daily.map((x) => <button key={x.date} onClick={() => setDate(x.date)} className="card" style={{ padding: 12, textAlign: 'center', cursor: 'pointer', borderColor: x.date === date ? 'var(--accent)' : undefined, background: 'var(--bg-2)' }} aria-label={`${fmtDate(x.date)}: ${x.summary}, ${Math.round(x.tMin)} to ${Math.round(x.tMax)} degrees, ${x.rainProb ?? 0}% rain`}>
            <div className="small muted">{fmtDate(x.date)}</div><div className="small" style={{ margin: '4px 0' }}>{x.summary}</div>
            <div style={{ height: 54, position: 'relative', margin: '4px auto', width: 10, background: 'var(--line)', borderRadius: 6 }}><div style={{ position: 'absolute', left: 0, right: 0, bottom: `${((x.tMin - minT) / (maxT - minT || 1)) * 100}%`, height: `${Math.max(((x.tMax - x.tMin) / (maxT - minT || 1)) * 100, 8)}%`, background: 'linear-gradient(var(--warn),var(--accent-2))', borderRadius: 6 }} /></div>
            <div><strong>{Math.round(x.tMax)}°</strong> <span className="faint">{Math.round(x.tMin)}°</span></div><div className="small" style={{ color: 'var(--accent-2)' }}><Umbrella size={12} /> {x.rainProb ?? 0}%</div></button>)}</div></section>
        <section className="card"><h2>Outing check</h2><div className="row wrap"><div className="field"><label htmlFor="od">Day</label><input id="od" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div><button className="btn primary" style={{ alignSelf: 'end' }} onClick={advise}>Check this day</button></div>
          {adv?.loading && <div style={{ marginTop: 12 }}><Loading lines={2} /></div>}{adv?.error && <div className="notice bad" style={{ marginTop: 12 }}>{adv.error}</div>}
          {A && (A.available ? <div className="stack" style={{ marginTop: 14 }}><div className="row"><span className={`badge ${lvl[0]}`}>{lvl[1]}</span>{A.window ? <span>Best window: <strong>{A.window.from}–{A.window.to}</strong></span> : <span className="muted">No comfortable window found between 8:00 and 20:00.</span>}</div>
            <div><div className="label">From the forecast</div><div>High {Math.round(A.day.tMax)}°, low {Math.round(A.day.tMin)}°, rain chance up to {A.day.rainProb ?? 0}%, wind up to {Math.round(A.day.windMax)} km/h.{A.issues.length ? ` Watch for: ${A.issues.join(', ')}.` : ' No notable concerns in the data.'}</div></div>
            <div className="notice small"><span>{A.note}</span></div>
            {A.level !== 'good' && <div className="muted">Backup idea: pick an indoor plan, or shift outdoors to the window above if there is one.</div>}</div> : <div className="notice warn" style={{ marginTop: 12 }}>{A.message}</div>)}</section>
      </>}
    </div>
  );
}
