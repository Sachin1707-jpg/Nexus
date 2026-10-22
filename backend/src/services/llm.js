import Groq from 'groq-sdk';
import { config } from '../config.js';
import { getSettings } from './settings.js';
import { httpError } from '../security/paths.js';

// Lazy-init Groq client (so missing key doesn't crash at import time)
let _groq = null;
function getGroq() {
  if (!_groq) {
    if (!config.GROQ_API_KEY) throw httpError(503, 'Groq API key is not configured. Add GROQ_API_KEY to your .env file.', 'groq_not_configured');
    _groq = new Groq({ apiKey: config.GROQ_API_KEY });
  }
  return _groq;
}

// ── Status (reflects Groq in production/dev, Ollama in test/fallback) ─────────
export async function ollamaStatus() {
  if (config.NODE_ENV === 'test' || (!config.GROQ_API_KEY && config.OLLAMA_URL)) {
    try {
      const r = await fetch(`${config.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!r.ok) return { running: false, model: config.OLLAMA_MODEL, message: 'Local model service returned an error.' };
      const j = await r.json();
      const names = (j.models ?? []).map((m) => m.name);
      const installed = names.some((n) => n === config.OLLAMA_MODEL || n.startsWith(`${config.OLLAMA_MODEL}:`));
      return { running: true, model: config.OLLAMA_MODEL, modelInstalled: installed, models: names, message: installed ? `Ready (${config.OLLAMA_MODEL})` : `Model ${config.OLLAMA_MODEL} not pulled` };
    } catch {
      return { running: false, model: config.OLLAMA_MODEL, message: `Model service is not reachable at ${config.OLLAMA_URL}.` };
    }
  }

  const model = config.GROQ_MODEL || 'qwen/qwen3.8-27b';
  if (!config.GROQ_API_KEY) {
    return { running: false, model, modelInstalled: false, models: [], message: 'Groq API key is not set. Add GROQ_API_KEY to your .env file.' };
  }
  try {
    const groq = getGroq();
    const list = await groq.models.list();
    const names = (list.data ?? []).map((m) => m.id);
    return { running: true, model, modelInstalled: true, models: names.slice(0, 20), message: `Groq ready (${model})` };
  } catch (e) {
    return { running: false, model, modelInstalled: false, models: [], message: `Groq error: ${e.message?.slice(0, 80) ?? 'Unknown error'}` };
  }
}

// ── Convert our internal message format → Groq/OpenAI messages ───────────────
function toGroqMessages(messages) {
  const result = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content || '' });
    } else if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content || '' });
    } else if (msg.role === 'assistant') {
      const m = { role: 'assistant', content: msg.content || '' };
      if (msg.tool_calls?.length) {
        m.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id || `call_${Date.now()}`,
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments ?? {}),
          },
        }));
      }
      result.push(m);
    } else if (msg.role === 'tool') {
      result.push({ role: 'tool', tool_call_id: msg.tool_call_id || `call_${msg.tool_name}`, content: msg.content || '' });
    }
  }
  return result;
}

// ── Convert our Ollama-style tool definitions → OpenAI-style (Groq uses OpenAI format) ──
function toGroqTools(ollamaTools) {
  if (!ollamaTools?.length) return undefined;
  return ollamaTools.map((t) => ({
    type: 'function',
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

// ── Test harness runner (for unit tests using local mock server) ──────────────
async function chatTestMock({ messages, tools, signal, onToken }) {
  const r = await fetch(`${config.OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.OLLAMA_MODEL,
      messages: messages.map((m) => {
        if (m.role === 'tool') return { role: 'tool', content: m.content, tool_name: m.tool_name };
        return { role: m.role, content: m.content || '', ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) };
      }),
      stream: false,
      ...(tools?.length ? { tools } : {}),
    }),
    signal,
  }).catch(() => {
    throw httpError(503, `Ollama is not reachable at ${config.OLLAMA_URL}.`, 'ollama_down');
  });
  if (!r.ok) throw httpError(502, `Mock returned error ${r.status}`, 'ollama_error');
  const text = await r.text();
  const line = text.trim().split('\n').pop();
  const j = JSON.parse(line || '{}');
  const content = j.message?.content || '';
  const toolCalls = j.message?.tool_calls || [];
  if (content && onToken) onToken(content);
  return { content, toolCalls };
}

// ── Main chat function ─────────────────────────────────────────────────────────
export async function chat({ messages, tools, signal, onToken, temperature = 0.2, numPredict = 2048 }) {
  // Use mock harness when running unit/integration tests
  if (config.NODE_ENV === 'test') {
    return chatTestMock({ messages, tools, signal, onToken });
  }

  const model = config.GROQ_MODEL || 'qwen/qwen3.8-27b';
  const groq = getGroq();

  const groqMessages = toGroqMessages(messages);
  const groqTools = toGroqTools(tools);

  const modelsToTry = [...new Set([model, 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'])];

  let response;
  let lastError;

  for (const modelToUse of modelsToTry) {
    if (signal?.aborted) break;
    try {
      const params = {
        model: modelToUse,
        messages: groqMessages,
        temperature,
        max_tokens: numPredict,
        ...(groqTools ? { tools: groqTools, tool_choice: 'auto' } : {}),
      };

      response = await groq.chat.completions.create(params, { signal });
      break;
    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError') throw e;
      const msg = e.message ?? String(e);
      if (msg.includes('API_KEY') || msg.includes('401') || msg.includes('authentication')) {
        throw httpError(503, 'Invalid Groq API key. Check GROQ_API_KEY in your .env.', 'groq_auth_error');
      }
      if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('quota')) {
        throw httpError(503, 'Groq rate limit reached. Please wait a moment.', 'groq_rate_limit');
      }
      if (msg.includes('503') || msg.includes('404') || msg.includes('model_not_found')) {
        continue; // try next model
      }
      throw httpError(502, `Groq error: ${msg.slice(0, 120)}`, 'groq_error');
    }
  }

  if (!response && lastError) {
    const msg = lastError.message ?? String(lastError);
    throw httpError(503, `Groq temporarily unavailable: ${msg.slice(0, 100)}`, 'groq_unavailable');
  }

  const choice = response?.choices?.[0];
  if (!choice) throw httpError(502, 'Groq returned no choices.', 'groq_error');

  const content = choice.message?.content || '';
  if (content && onToken) onToken(content);

  // Parse tool calls from Groq response
  const toolCalls = (choice.message?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    function: {
      name: tc.function.name,
      arguments: (() => {
        try { return JSON.parse(tc.function.arguments); }
        catch { return tc.function.arguments ?? {}; }
      })(),
    },
  }));

  return { content: content.trim(), toolCalls };
}
