import { useState, useEffect } from 'react';
import {
  Lock, Download, Trash2, ThumbsUp, ThumbsDown, EyeOff, Pencil,
  Sparkles, Smile, Users, FolderGit2, Clock, Heart, RefreshCw, UserCheck,
  Activity, AlertTriangle, Wrench, Compass, Target, ShieldAlert, Zap
} from 'lucide-react';
import { api } from '../services/api.js';
import { useApp } from '../services/store.jsx';
import { useAsync, Loading, Empty, ErrorBox, PageHead, Switch, Modal } from '../components/ui.jsx';

const ORIGIN = {
  reported: ['accent', 'Directly from conversations'],
  ai_interpretation: ['ok', 'AI Observation'],
  user_corrected: ['ok', 'Corrected by you']
};

const PROMPTS = [
  'What took most of your energy this week, and was it what you wanted it to?',
  'What is one small thing that would make tomorrow easier?',
  'Which deadline feels heaviest, and what is its first 15-minute step?',
  'What went better than you expected recently?'
];

export default function Insights() {
  const { settings, saveSettings, toast } = useApp();
  const [period, setPeriod] = useState(7); // 1 = Today, 7 = Last 7 Days
  const { loading, data, error, reload } = useAsync(() => api(`/insights?days=${period}`), [settings.insightsConsent, period]);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);

  // Auto-analyze in real time if no insights exist yet but user has conversations
  useEffect(() => {
    if (data && settings.insightsConsent && !data.insights?.length && data.stats?.messagesAnalysed > 0 && !busy) {
      gen(true);
    }
  }, [data?.insights?.length, data?.stats?.messagesAnalysed, period]);

  const gen = async (silent = false) => {
    setBusy(true);
    try {
      const r = await api('/insights/generate', { method: 'POST', body: { days: period } });
      if (!silent) toast(r.message, r.created.length ? 'ok' : '');
      reload();
    } catch (e) {
      if (!silent) toast(e.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const fb = async (id, feedback) => {
    await api(`/insights/${id}`, { method: 'PATCH', body: { feedback } });
    reload();
  };

  const dismiss = async (id) => {
    await api(`/insights/${id}`, { method: 'PATCH', body: { dismissed: true } });
    reload();
  };

  const mood = async (m) => {
    await api('/insights/mood', { method: 'POST', body: { mood: m } });
    toast('Check-in saved', 'ok');
    reload();
  };

  const exportJson = async () => {
    const r = await fetch('/api/insights/export', { credentials: 'include' });
    const b = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `nexus-insights-${period === 1 ? 'today' : '7days'}.json`;
    a.click();
  };

  const wipe = async () => {
    await api('/insights', { method: 'DELETE' });
    setConfirm(false);
    toast('Insights and check-ins deleted', 'ok');
    reload();
  };

  const analysis = data?.analysis;
  const summaryInsights = data?.insights?.filter((i) => i.kind === 'summary') ?? [];
  const peopleInsights = data?.insights?.filter((i) => i.kind === 'person') ?? [];

  return (
    <div className="page">
      {/* Top Header & Timeframe Switcher */}
      <div className="page-head">
        <div>
          <PageHead
            title="Personal Insights"
            sub={`Multi-dimensional analysis for ${period === 1 ? 'Today (Last 24h)' : 'the Last 7 Days'}.`}
          />
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          {/* Timeframe Selector: Today vs Last 7 Days */}
          <div className="tabs" role="tablist" aria-label="Analysis timeframe">
            <button
              role="tab"
              aria-selected={period === 1}
              onClick={() => setPeriod(1)}
              style={{ fontWeight: period === 1 ? 600 : 400 }}
            >
              Today
            </button>
            <button
              role="tab"
              aria-selected={period === 7}
              onClick={() => setPeriod(7)}
              style={{ fontWeight: period === 7 ? 600 : 400 }}
            >
              Last 7 Days
            </button>
          </div>

          {settings.insightsConsent && (
            <span className="badge ok" title="All saved conversations are automatically analyzed in real-time">
              <span className="dot ok" /> Real-time sync
            </span>
          )}

          <button className="btn sm" onClick={() => gen(false)} disabled={busy || !settings.insightsConsent}>
            <RefreshCw size={13} className={busy ? 'spin' : ''} />
            {busy ? 'Analyzing…' : 'Re-analyze'}
          </button>
        </div>
      </div>

      {/* Privacy Switch */}
      <section className="card">
        <div className="row">
          <Lock size={18} style={{ color: 'var(--accent)' }} />
          <div className="grow">
            <strong>Automatic private analysis</strong>
            <div className="muted small">
              Nexus continuously evaluates mood, productivity patterns, tool usage, worries, and red flags on this machine.
            </div>
          </div>
          <Switch
            checked={settings.insightsConsent}
            onChange={(v) => saveSettings({ insightsConsent: v })}
            label="Allow insights analysis"
          />
        </div>
      </section>

      {loading ? (
        <div className="card"><Loading /></div>
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : !settings.insightsConsent ? (
        <Empty icon={Lock} title="Analysis is off">
          Turn it on above to view your personalized productivity rhythms, mood causes, and red flags.
        </Empty>
      ) : (
        <>
          {/* 1. Red Flag Detection (Health & Stress) */}
          {analysis?.redFlags?.length > 0 && (
            <section className="card" style={{ borderLeft: '4px solid var(--bad)', background: 'color-mix(in srgb, var(--bad) 6%, var(--surface))' }}>
              <div className="row" style={{ marginBottom: 12 }}>
                <ShieldAlert size={18} style={{ color: 'var(--bad)' }} />
                <h2 className="grow" style={{ fontSize: 16 }}>Red Flag Detection (Health & Stress)</h2>
                <span className="badge bad">{analysis.redFlags.length} Alert{analysis.redFlags.length > 1 ? 's' : ''}</span>
              </div>
              <div className="stack" style={{ gap: 10 }}>
                {analysis.redFlags.map((flag, idx) => (
                  <div key={idx} className="notice bad" style={{ display: 'grid', gap: 4, padding: 12 }}>
                    <div className="row wrap">
                      <strong style={{ color: 'var(--bad)' }}>{flag.title}</strong>
                      <span className="badge bad" style={{ fontSize: 11 }}>{flag.category}</span>
                      <span className="badge" style={{ fontSize: 11, textTransform: 'uppercase' }}>Severity: {flag.severity}</span>
                    </div>
                    <div className="small" style={{ lineHeight: 1.5, opacity: 0.9 }}>{flag.description}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 2. Mood & Sentiment Analysis with Predicted Causes */}
          <section className="card">
            <div className="row" style={{ marginBottom: 12 }}>
              <Heart size={18} style={{ color: '#ec4899' }} />
              <h2 className="grow">Mood & Sentiment Analysis</h2>
              {analysis?.moodAndSentiment?.overallMood && (
                <span className="badge ok" style={{ fontSize: 13, fontWeight: 550 }}>
                  {analysis.moodAndSentiment.overallMood}
                </span>
              )}
              {analysis?.moodAndSentiment?.sentimentTone && (
                <span className="badge accent" style={{ fontSize: 12 }}>
                  Tone: {analysis.moodAndSentiment.sentimentTone}
                </span>
              )}
            </div>

            {/* Predicted Causes */}
            <div style={{ marginTop: 8, padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 'var(--r-md)' }}>
              <div className="row small" style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                <Compass size={14} style={{ color: 'var(--accent)' }} />
                <span>Predicted Drivers & Underlying Causes:</span>
              </div>
              {!analysis?.moodAndSentiment?.predictedCauses?.length ? (
                <div className="faint small">No clear stress or mood drivers detected in this timeframe.</div>
              ) : (
                <div className="stack" style={{ gap: 6, marginTop: 4 }}>
                  {analysis.moodAndSentiment.predictedCauses.map((cause, idx) => (
                    <div key={idx} className="row small" style={{ alignItems: 'flex-start' }}>
                      <Zap size={13} style={{ color: 'var(--warn)', marginTop: 3, flexShrink: 0 }} />
                      <span>{cause}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Daily Mood Check-In & History */}
            <div style={{ marginTop: 16 }}>
              <div className="label">Check in for {period === 1 ? 'today' : 'recent days'}:</div>
              <div className="row wrap" role="group" aria-label="Mood check-in" style={{ marginTop: 6 }}>
                {[['Rough', 1], ['Low', 2], ['Okay', 3], ['Good', 4], ['Great', 5]].map(([l, v]) => (
                  <button key={v} className="btn sm" onClick={() => mood(v)}>
                    {l}
                  </button>
                ))}
              </div>
              {data.moods.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="faint small" style={{ marginBottom: 4 }}>Your self-reported check-in history:</div>
                  <div
                    style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 48 }}
                    role="img"
                    aria-label={`${data.moods.length} mood check-ins`}
                  >
                    {data.moods.slice(-30).map((m) => (
                      <div
                        key={m.id}
                        title={`${m.created_at.slice(0, 10)}: ${m.mood}/5`}
                        style={{
                          width: 10,
                          height: `${m.mood * 20}%`,
                          background: 'var(--accent)',
                          opacity: 0.35 + m.mood * 0.13,
                          borderRadius: 3
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Grid Row: Things I'm Worried About + Peak Productivity */}
          <div className="grid-2">
            {/* 3. Things I'm Worried About */}
            <section className="card">
              <div className="row" style={{ marginBottom: 12 }}>
                <AlertTriangle size={18} style={{ color: 'var(--warn)' }} />
                <h2 className="grow">Things I'm Worried About</h2>
                <span className="badge">{analysis?.worries?.length || 0}</span>
              </div>
              {!analysis?.worries?.length ? (
                <div className="faint small">
                  No active worries, anxieties, or high-pressure items detected in your conversations for {analysis?.periodLabel}.
                </div>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {analysis.worries.map((w, idx) => (
                    <article key={idx} className="card" style={{ background: 'var(--bg-2)', padding: '10px 12px' }}>
                      <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <strong style={{ fontSize: '13.5px' }}>{w.worry}</strong>
                        <span className={`badge ${w.severity?.toLowerCase() === 'high' ? 'bad' : 'warn'}`} style={{ fontSize: 11 }}>
                          {w.severity} Severity
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* 4. Peak Productivity & Time Patterns */}
            <section className="card">
              <div className="row" style={{ marginBottom: 12 }}>
                <Clock size={18} style={{ color: 'var(--accent)' }} />
                <h2 className="grow">Peak Productivity & Time Patterns</h2>
                {analysis?.productivity?.peakHour && (
                  <span className="badge accent">Peak: {analysis.productivity.peakHour}</span>
                )}
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--r-md)', marginBottom: 12 }}>
                <div className="row small" style={{ fontWeight: 600, marginBottom: 4 }}>
                  <span>Active Window:</span>
                  <span className="badge ok">{analysis?.productivity?.peakWindow}</span>
                </div>
                <div className="small muted" style={{ lineHeight: 1.5 }}>
                  {analysis?.productivity?.summary}
                </div>
              </div>

              {/* 24-Hour Activity Histogram */}
              {analysis?.productivity?.hourly && (
                <div>
                  <div className="label" style={{ fontSize: 11.5, marginBottom: 6 }}>Activity by Hour of Day (0:00 to 23:00)</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 46 }}>
                    {analysis.productivity.hourly.map((cnt, hour) => {
                      const maxVal = Math.max(...analysis.productivity.hourly, 1);
                      const heightPct = Math.max((cnt / maxVal) * 100, 6);
                      return (
                        <div
                          key={hour}
                          title={`${hour}:00 - ${cnt} interaction${cnt === 1 ? '' : 's'}`}
                          style={{
                            flex: 1,
                            height: `${heightPct}%`,
                            background: cnt > 0 ? 'var(--accent)' : 'var(--line-2)',
                            opacity: cnt > 0 ? 0.4 + (cnt / maxVal) * 0.6 : 0.3,
                            borderRadius: '2px 2px 0 0'
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="row faint" style={{ justifyContent: 'space-between', fontSize: 10, marginTop: 4 }}>
                    <span>12 AM</span>
                    <span>6 AM</span>
                    <span>12 PM</span>
                    <span>6 PM</span>
                    <span>11 PM</span>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Grid Row: Topic Clustering + Tool Usage Pattern */}
          <div className="grid-2">
            {/* 5. Topic Clustering (Your Priorities) */}
            <section className="card">
              <div className="row" style={{ marginBottom: 12 }}>
                <Activity size={18} style={{ color: 'var(--accent-2)' }} />
                <h2 className="grow">Topic Clustering (Your Priorities)</h2>
                <span className="badge">{analysis?.topicClusters?.length || 0} Clusters</span>
              </div>
              {!analysis?.topicClusters?.length ? (
                <div className="faint small">No priority topic clusters detected for this period.</div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {analysis.topicClusters.map((tc) => (
                    <div key={tc.name}>
                      <div className="row small" style={{ marginBottom: 3 }}>
                        <span className="grow" style={{ fontWeight: 500 }}>{tc.name}</span>
                        <span className="muted">{tc.count} ({tc.pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--line)', borderRadius: 4 }}>
                        <div
                          style={{
                            width: `${tc.pct}%`,
                            height: '100%',
                            background: 'var(--accent-2)',
                            borderRadius: 4
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="faint small" style={{ marginTop: 4 }}>
                    Reflects allocation of your conversation focus and work energy.
                  </div>
                </div>
              )}
            </section>

            {/* 6. Tool Usage Pattern */}
            <section className="card">
              <div className="row" style={{ marginBottom: 12 }}>
                <Wrench size={18} style={{ color: 'var(--ok)' }} />
                <h2 className="grow">Tool Usage Pattern</h2>
                <span className="badge ok">{analysis?.toolUsage?.totalCalls || 0} MCP Calls</span>
              </div>
              {!analysis?.toolUsage?.tools?.length ? (
                <div className="faint small">No tools were invoked during this timeframe.</div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {analysis.toolUsage.tools.slice(0, 6).map((t) => (
                    <div key={t.name}>
                      <div className="row small" style={{ marginBottom: 3 }}>
                        <span className="grow" style={{ fontWeight: 500 }}>{t.label}</span>
                        <span className="muted">{t.count} ({t.pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--line)', borderRadius: 4 }}>
                        <div
                          style={{
                            width: `${t.pct}%`,
                            height: '100%',
                            background: 'var(--ok)',
                            borderRadius: 4
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="faint small" style={{ marginTop: 4 }}>
                    Automated assistant capabilities you utilized in {analysis?.periodLabel}.
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* 7. Habit Formation & Goal Tracking */}
          <section className="card">
            <div className="row" style={{ marginBottom: 12 }}>
              <Target size={18} style={{ color: 'var(--accent)' }} />
              <h2 className="grow">Habit Formation & Goal Tracking</h2>
              <span className="badge">{analysis?.habitsAndGoals?.length || 0}</span>
            </div>
            {!analysis?.habitsAndGoals?.length ? (
              <div className="faint small">
                Habitual behaviors and long-term milestones will be compiled as you chat with Nexus.
              </div>
            ) : (
              <div className="grid-2" style={{ gap: 12 }}>
                {analysis.habitsAndGoals.map((item, idx) => (
                  <article key={idx} className="card" style={{ background: 'var(--bg-2)', padding: '12px 14px' }}>
                    <div className="row wrap" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ fontSize: '14px' }}>{item.title}</strong>
                      <div className="row" style={{ gap: 6 }}>
                        <span className="badge" style={{ fontSize: 11, textTransform: 'capitalize' }}>{item.type}</span>
                        <span className={`badge ${item.status === 'Watch Out' ? 'bad' : 'ok'}`} style={{ fontSize: 11 }}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                    <p className="small muted" style={{ lineHeight: 1.5, marginTop: 4 }}>{item.detail}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* 8. People & Relationships Mentions */}
          {peopleInsights.length > 0 && (
            <section className="card">
              <div className="row" style={{ marginBottom: 12 }}>
                <Users size={18} style={{ color: 'var(--accent-2)' }} />
                <h2 className="grow">People & Contacts Discussed</h2>
                <span className="badge">{peopleInsights.length}</span>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {peopleInsights.map((i) => (
                  <article key={i.id} className="card" style={{ background: 'var(--bg-2)', padding: '10px 14px' }}>
                    <p style={{ margin: '2px 0 6px', fontSize: '13.5px' }}>{i.text}</p>
                    <div className="row wrap" style={{ gap: 6 }}>
                      <button className={`btn sm ${i.feedback === 'accurate' ? 'primary' : ''}`} onClick={() => fb(i.id, 'accurate')}>
                        <ThumbsUp size={12} />Accurate
                      </button>
                      <button className={`btn sm ${i.feedback === 'not_accurate' ? 'primary' : ''}`} onClick={() => fb(i.id, 'not_accurate')}>
                        <ThumbsDown size={12} />Not accurate
                      </button>
                      <button className="btn sm ghost" onClick={() => setEdit(i)}>
                        <Pencil size={12} />Correct
                      </button>
                      <button className="btn sm ghost" onClick={() => dismiss(i.id)}>
                        <EyeOff size={12} />Dismiss
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Reflection Prompt */}
          <section className="card">
            <div className="label">A prompt to reflect on ({analysis?.periodLabel})</div>
            <p style={{ marginTop: 6, fontSize: '15px', lineHeight: 1.5 }}>{prompt}</p>
          </section>
        </>
      )}

      {/* Data Export & Reset */}
      <section className="card">
        <h2>Data Management</h2>
        <div className="row wrap">
          <button className="btn" onClick={exportJson}>
            <Download size={15} />Export {period === 1 ? 'Today' : '7 Days'} Insights
          </button>
          <button className="btn danger" onClick={() => setConfirm(true)}>
            <Trash2 size={15} />Delete all insights
          </button>
        </div>
      </section>

      {edit && (
        <EditInsight
          i={edit}
          onClose={() => setEdit(null)}
          onSave={async (t) => {
            await api(`/insights/${edit.id}`, { method: 'PATCH', body: { text: t } });
            setEdit(null);
            reload();
          }}
        />
      )}

      {confirm && (
        <Modal title="Delete all insights?" onClose={() => setConfirm(false)}>
          <p>This permanently removes all observations and mood check-ins. Your actual conversations are not affected.</p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="btn danger" onClick={wipe}>Delete everything</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditInsight({ i, onClose, onSave }) {
  const [t, setT] = useState(i.text);
  return (
    <Modal title="Correct this observation" onClose={onClose}>
      <textarea
        className="textarea"
        rows={4}
        value={t}
        onChange={(e) => setT(e.target.value)}
        aria-label="Observation text"
        maxLength={400}
      />
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!t.trim()} onClick={() => onSave(t)}>Save correction</button>
      </div>
    </Modal>
  );
}
