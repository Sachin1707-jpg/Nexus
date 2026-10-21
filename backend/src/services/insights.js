import { getDb } from '../database/db.js';
import { randomId } from '../security/crypto.js';
import { chat } from './llm.js';
import { getSettings } from './settings.js';
import { httpError } from '../security/paths.js';
import { getBattery } from '../integrations/system.js';

const TOPICS = {
  'Deadlines & workload': /\b(deadline|assignment|submit|exam|project|due|workload|pending|kaam)\b/i,
  'Stress & overwhelm': /\b(stress\w*|overwhelm\w*|anxious|anxiety|tension|pressure|burn ?out|ghabra\w*)\b/i,
  'Low mood': /\b(sad|low|down|udaas|lonely|akela|akeli|depress\w*|cry|rona)\b/i,
  'Sleep & energy': /\b(sleep|tired|thak\w*|energy|insomnia|neend)\b/i,
  'Study / career': /\b(study|college|faculty|career|job|interview|placement|class|lecture)\b/i,
  'Health & routine': /\b(gym|workout|exercise|diet|health|routine|habit|walk)\b/i,
  'Relationships': /\b(friend|family|mom|dad|partner|relationship|dost)\b/i,
};

export function eligibleMessages(days = 30) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return getDb().prepare(`SELECT m.id, m.content, m.created_at, m.conversation_id FROM messages m JOIN conversations c ON c.id=m.conversation_id
    WHERE m.role='user' AND (c.save_history=1 OR c.save_history IS NULL) AND m.created_at >= ? ORDER BY m.created_at`).all(since);
}

export function eligibleAssistantMessages(days = 30) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return getDb().prepare(`SELECT m.id, m.content, m.meta, m.created_at, m.conversation_id FROM messages m JOIN conversations c ON c.id=m.conversation_id
    WHERE m.role='assistant' AND (c.save_history=1 OR c.save_history IS NULL) AND m.created_at >= ? ORDER BY m.created_at`).all(since);
}

export function topicStats(days = 30) {
  const msgs = eligibleMessages(days);
  const stats = Object.entries(TOPICS).map(([topic, re]) => {
    const hits = msgs.filter((m) => re.test(m.content));
    return {
      topic,
      count: hits.length,
      conversations: [...new Set(hits.map((h) => h.conversation_id))].length,
      sample: hits.slice(-3).map((h) => ({ messageId: h.id, conversationId: h.conversation_id, date: h.created_at.slice(0, 10) }))
    };
  }).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  return { messagesAnalysed: msgs.length, conversationsAnalysed: new Set(msgs.map((m) => m.conversation_id)).size, periodDays: days, topics: stats };
}

export const MIN_MESSAGES = 1;

let lastAnalyzedAt = 0;
let isAnalyzing = false;

export async function generateInsights({ days = 30, signal } = {}) {
  const s = getSettings();
  if (!s.insightsConsent) {
    return { created: [], message: 'Insights analysis is disabled in settings.' };
  }
  const stats = topicStats(days);
  const msgs = eligibleMessages(days);
  if (!msgs.length) return { created: [], message: 'No messages to analyze yet. Start chatting and insights will automatically appear.' };

  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const db = getDb();
  const created = [];
  const ins = db.prepare('INSERT INTO insights (id,kind,text,origin,period_start,period_end,confidence,evidence,created_at) VALUES (?,?,?,?,?,?,?,?,?)');

  // Clear previous automatic unrated insights so we provide a fresh, updated profile without duplicate spam
  db.prepare("DELETE FROM insights WHERE origin IN ('ai_interpretation', 'reported') AND feedback IS NULL AND dismissed=0").run();

  // Directly reported, rule-based observations (counts are facts about the data).
  for (const t of stats.topics.filter((x) => x.count >= 1).slice(0, 6)) {
    const id = randomId();
    ins.run(id, 'topic', `You brought up "${t.topic}" in ${t.count} message${t.count > 1 ? 's' : ''} across ${t.conversations} conversation${t.conversations > 1 ? 's' : ''}.`, 'reported', start, end, 'high', JSON.stringify(t.sample), new Date().toISOString());
    created.push(id);
  }

  // LLM structured person & life analysis
  try {
    const recentSample = msgs.slice(-40).map((m) => `[${m.created_at.slice(0, 10)}] ${m.content.slice(0, 240)}`).join('\n');
    const r = await chat({
      signal,
      think: false,
      format: 'json',
      temperature: 0.1,
      numPredict: 600,
      messages: [
        {
          role: 'system',
          content: 'You are an insightful personal analyst. From the user\'s conversation messages, analyze and extract structured insights about the user in valid JSON:\n{\n  "summary": "1-2 sentence profile snapshot of who the user is, what they focus on, and their style",\n  "people": [\n    { "name": "Person name or role (e.g. Rahul, Professor, Teammate)", "relation": "Friend/Colleague/Family/Mentor", "detail": "What was discussed or their connection" }\n  ],\n  "projects": [\n    { "title": "Project, study, or goal name", "detail": "What is being worked on or planned" }\n  ],\n  "habits": [\n    { "habit": "Observed work, schedule, or communication pattern", "detail": "Details of the habit" }\n  ],\n  "wellbeing": [\n    { "area": "Energy/Stress/Mindset", "observation": "Observed feeling or emotional context" }\n  ]\n}\nIf no information exists for a category, use an empty list []. Base everything strictly on the user messages. Do not invent details. Output ONLY valid JSON.'
        },
        { role: 'user', content: recentSample }
      ]
    });

    let parsed = null;
    try {
      parsed = JSON.parse(r.content);
    } catch {
      const match = r.content?.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (parsed) {
      const now = new Date().toISOString();
      if (parsed.summary && typeof parsed.summary === 'string' && parsed.summary.trim()) {
        const id = randomId();
        ins.run(id, 'summary', parsed.summary.trim(), 'ai_interpretation', start, end, 'high', JSON.stringify([]), now);
        created.push(id);
      }
      if (Array.isArray(parsed.people)) {
        for (const p of parsed.people.slice(0, 8)) {
          if (!p.name) continue;
          const id = randomId();
          const desc = `${p.name}${p.relation ? ` (${p.relation})` : ''}: ${p.detail || 'Mentioned in conversation'}`;
          ins.run(id, 'person', desc, 'ai_interpretation', start, end, 'high', JSON.stringify([]), now);
          created.push(id);
        }
      }
      if (Array.isArray(parsed.projects)) {
        for (const pr of parsed.projects.slice(0, 8)) {
          if (!pr.title) continue;
          const id = randomId();
          const desc = `${pr.title}: ${pr.detail || 'Ongoing focus area'}`;
          ins.run(id, 'project', desc, 'ai_interpretation', start, end, 'high', JSON.stringify([]), now);
          created.push(id);
        }
      }
      if (Array.isArray(parsed.habits)) {
        for (const h of parsed.habits.slice(0, 6)) {
          if (!h.habit) continue;
          const id = randomId();
          const desc = `${h.habit}: ${h.detail || 'Observed pattern'}`;
          ins.run(id, 'habit', desc, 'ai_interpretation', start, end, 'medium', JSON.stringify([]), now);
          created.push(id);
        }
      }
      if (Array.isArray(parsed.wellbeing)) {
        for (const w of parsed.wellbeing.slice(0, 6)) {
          if (!w.observation) continue;
          const id = randomId();
          const desc = `${w.area || 'Mindset'}: ${w.observation}`;
          ins.run(id, 'wellbeing', desc, 'ai_interpretation', start, end, 'medium', JSON.stringify([]), now);
          created.push(id);
        }
      }
    }
  } catch {
    /* model unavailable: reported insights still stand */
  }

  lastAnalyzedAt = Date.now();
  return { created, message: created.length ? 'Insights updated.' : 'No clear patterns yet.' };
}

const analysisCache = {};

export async function getMultiDimensionalAnalysis(days = 7) {
  const userMsgs = eligibleMessages(days);
  const assistantMsgs = eligibleAssistantMessages(days);
  const now = Date.now();
  const latestUserMsgTime = userMsgs.length ? new Date(userMsgs[userMsgs.length - 1].created_at).getTime() : 0;

  const cached = analysisCache[days];
  let aiData = cached?.aiData;

  if (!cached || latestUserMsgTime > cached.at || (now - cached.at > 90000)) {
    if (userMsgs.length > 0) {
      try {
        const sample = userMsgs.slice(-30).map((m) => `[${m.created_at.slice(0, 16)}] ${m.content.slice(0, 240)}`).join('\n');
        const r = await chat({
          think: false,
          format: 'json',
          temperature: 0.1,
          numPredict: 550,
          messages: [
            {
              role: 'system',
              content: `You are an observant personal & productivity analyst. Given the user messages from ${days === 1 ? 'today' : 'the last 7 days'}, extract structured insights in valid JSON:
{
  "overallMood": "Short 2-4 word mood descriptor (e.g. Stressed & Overloaded, Focused & Motivated, Fatigued, Calm)",
  "sentimentTone": "Urgent | Stressed | Neutral | Positive | Low Energy",
  "predictedCauses": ["Cause 1 (e.g. Imminent DSA assignment deadline)", "Cause 2 (e.g. Laptop battery health degradation)", "Cause 3 (e.g. Late night coding fatigue)"],
  "worries": [{"worry": "Specific worry or tension point", "severity": "High | Medium | Low"}],
  "habitsAndGoals": [{"title": "Habit or Goal name", "type": "habit | goal", "status": "In Progress | Positive | Watch Out", "detail": "Observed pattern or task"}]
}
Ground every item strictly in the messages. Output ONLY valid JSON.`
            },
            { role: 'user', content: sample }
          ]
        });
        const match = r.content?.match(/\{[\s\S]*\}/);
        if (match) aiData = JSON.parse(match[0]);
      } catch {
        /* fallback to existing or default */
      }
    }

    if (!aiData) {
      aiData = {
        overallMood: userMsgs.length ? 'Engaged & Active' : 'Calm / No Messages',
        sentimentTone: 'Neutral',
        predictedCauses: [],
        worries: [],
        habitsAndGoals: []
      };
    }
    analysisCache[days] = { at: now, aiData };
  }

  // 1. Peak Productivity & Time Patterns
  const hourly = new Array(24).fill(0);
  for (const m of userMsgs) {
    const h = new Date(m.created_at).getHours();
    hourly[h] = (hourly[h] || 0) + 1;
  }
  let night = 0, morning = 0, afternoon = 0, evening = 0;
  for (let h = 0; h < 24; h++) {
    const c = hourly[h];
    if (h >= 22 || h <= 5) night += c;
    else if (h >= 6 && h <= 11) morning += c;
    else if (h >= 12 && h <= 16) afternoon += c;
    else evening += c;
  }
  let peakWindow = 'Daytime';
  const maxSeg = Math.max(night, morning, afternoon, evening);
  if (maxSeg > 0) {
    if (maxSeg === night) peakWindow = 'Late Night (10 PM - 5 AM)';
    else if (maxSeg === evening) peakWindow = 'Evening (5 PM - 10 PM)';
    else if (maxSeg === afternoon) peakWindow = 'Afternoon (12 PM - 5 PM)';
    else peakWindow = 'Morning (6 AM - 12 PM)';
  }
  const peakHourIdx = hourly.indexOf(Math.max(...hourly));
  const peakHourFormatted = `${peakHourIdx % 12 || 12}:00 ${peakHourIdx >= 12 ? 'PM' : 'AM'}`;

  // 2. Tool Usage Pattern
  const toolCounts = {};
  const toolLabels = {
    system_get_health: 'Battery & System Diagnostics',
    system_list_processes: 'Process & RAM Inspection',
    calendar_list_events: 'Calendar & Meeting Lookup',
    calendar_create_event: 'Scheduling Events',
    tasks_list: 'Task Viewing',
    tasks_create: 'Task Creation',
    weather_get_forecast: 'Weather Forecast',
    gmail_propose_send: 'Email Composition',
    github_list_issues: 'GitHub Management',
  };
  let totalTools = 0;
  for (const msg of assistantMsgs) {
    if (!msg.meta) continue;
    try {
      const meta = typeof msg.meta === 'string' ? JSON.parse(msg.meta) : msg.meta;
      if (Array.isArray(meta.tools)) {
        for (const t of meta.tools) {
          if (!t?.name) continue;
          toolCounts[t.name] = (toolCounts[t.name] || 0) + 1;
          totalTools++;
        }
      }
    } catch {}
  }
  const toolList = Object.entries(toolCounts).map(([name, count]) => ({
    name,
    label: toolLabels[name] || name.replace(/_/g, ' '),
    count,
    pct: totalTools > 0 ? Math.round((count / totalTools) * 100) : 0
  })).sort((a, b) => b.count - a.count);

  // 3. Topic Clustering (Your Priorities)
  const CLUSTERS = {
    'Development & Tech': /\b(code|coding|git|backend|nexus|server|script|python|javascript|model|ollama|whisper|database|battery|hardware)\b/i,
    'Deadlines & Tasks': /\b(deadline|assignment|submit|due|pending|task|todo|exam|project|urgent)\b/i,
    'Health, Sleep & Energy': /\b(sleep|tired|thak\w*|energy|rest|health|insomnia|neend|exhausted)\b/i,
    'Meetings & Academics': /\b(meeting|calendar|schedule|professor|sharma|class|college|faculty)\b/i,
    'Outreach & Emails': /\b(email|mail|send|reply|message|contact|rahul)\b/i
  };
  const clusters = Object.entries(CLUSTERS).map(([name, re]) => {
    const hits = userMsgs.filter((m) => re.test(m.content));
    return { name, count: hits.length };
  }).filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  const totalClusterHits = clusters.reduce((acc, c) => acc + c.count, 0);
  const topicClusters = clusters.map((c) => ({
    ...c,
    pct: totalClusterHits > 0 ? Math.round((c.count / totalClusterHits) * 100) : 0
  }));

  // 4. Red Flag Detection
  const redFlags = [];
  try {
    const bat = await getBattery();
    if (bat?.healthPct != null && bat.healthPct < 50) {
      redFlags.push({
        title: `Critical Battery Degradation (${bat.degradationPct}% Wear)`,
        severity: 'high',
        category: 'Hardware Safety',
        description: `Your laptop battery is degraded to ${bat.healthPct}% of factory capacity (${bat.fullChargeCapacityMWh} mWh / ${bat.designCapacityMWh} mWh). High risk of sudden shutdown under load.`
      });
    }
  } catch {}

  if (night > 0 || userMsgs.some((m) => /\b(tired|sleep|thak\w*|late night|exhausted)\b/i.test(m.content))) {
    redFlags.push({
      title: 'Late-Night Activity & Sleep Debt',
      severity: 'medium',
      category: 'Well-Being',
      description: `${night > 0 ? `${night} message(s) logged past midnight (10 PM - 5 AM). ` : ''}Fatigue markers detected in conversations. Prioritize scheduled recovery sleep.`
    });
  }

  if (userMsgs.filter((m) => /\b(deadline|urgent|pending|due|submit)\b/i.test(m.content)).length >= 2) {
    redFlags.push({
      title: 'Compressed Deadlines & Urgency',
      severity: 'medium',
      category: 'Workload',
      description: 'Multiple urgent tasks or deadlines discussed in this timeframe. Break down large milestones into smaller steps.'
    });
  }

  return {
    periodDays: days,
    periodLabel: days === 1 ? 'Today' : 'Last 7 Days',
    messagesAnalysed: userMsgs.length,
    productivity: {
      peakWindow,
      peakHour: peakHourFormatted,
      summary: userMsgs.length
        ? `${peakWindow} saw your highest interaction volume. ${night > 0 ? `Active past midnight (${night} messages).` : 'Regular daytime rhythm.'}`
        : 'No activity logged for this time window.',
      hourly
    },
    toolUsage: {
      totalCalls: totalTools,
      tools: toolList
    },
    topicClusters,
    moodAndSentiment: {
      overallMood: aiData.overallMood || 'Focused',
      sentimentTone: aiData.sentimentTone || 'Neutral',
      predictedCauses: Array.isArray(aiData.predictedCauses) ? aiData.predictedCauses : []
    },
    worries: Array.isArray(aiData.worries) ? aiData.worries : [],
    habitsAndGoals: Array.isArray(aiData.habitsAndGoals) ? aiData.habitsAndGoals : [],
    redFlags
  };
}

export async function autoUpdateInsightsIfNeeded(days = 7) {
  if (isAnalyzing) return;
  const now = Date.now();
  if (now - lastAnalyzedAt < 15000) return;

  const msgs = eligibleMessages(days);
  if (!msgs.length) return;

  const existing = listInsights();
  const latestMsgTime = new Date(msgs[msgs.length - 1].created_at).getTime();

  if (!existing.length || latestMsgTime > lastAnalyzedAt) {
    isAnalyzing = true;
    try {
      await generateInsights({ days });
    } finally {
      isAnalyzing = false;
    }
  }
}

export const listInsights = () => getDb().prepare('SELECT * FROM insights WHERE dismissed=0 ORDER BY created_at DESC LIMIT 100').all().map((r) => ({ ...r, evidence: r.evidence ? JSON.parse(r.evidence) : [] }));
export const addMood = (mood, note) => { const id = randomId(); getDb().prepare('INSERT INTO mood_checkins (id,mood,note,created_at) VALUES (?,?,?,?)').run(id, mood, note ?? null, new Date().toISOString()); return id; };
export const listMoods = (days = 90) => getDb().prepare('SELECT * FROM mood_checkins WHERE created_at >= ? ORDER BY created_at').all(new Date(Date.now() - days * 864e5).toISOString());
export function exportAll() {
  const db = getDb();
  return { exportedAt: new Date().toISOString(), insights: listInsights(), moods: listMoods(3650), memories: db.prepare('SELECT * FROM memories').all(), topics: topicStats(365) };
}
export function deleteAllInsights() { const db = getDb(); db.exec('DELETE FROM insights; DELETE FROM mood_checkins;'); }
