import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { getSettings } from './settings.js';
import { httpError } from '../security/paths.js';

// Lazy-init Gemini client (so missing key doesn't crash at import time)
let _ai = null;
function getAI() {
  if (!_ai) {
    if (!config.GEMINI_API_KEY) throw httpError(503, 'Gemini API key is not configured. Add GEMINI_API_KEY to your .env file.', 'gemini_not_configured');
    _ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
  return _ai;
}

// ── Status (reflects Gemini in production/dev, Ollama in test/fallback) ──────
export async function ollamaStatus() {
  if (config.NODE_ENV === 'test' || (!config.GEMINI_API_KEY && config.OLLAMA_URL)) {
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

  const model = config.GEMINI_MODEL || 'gemini-3.6-flash';
  if (!config.GEMINI_API_KEY) {
    return { running: false, model, modelInstalled: false, models: [], message: 'Gemini API key is not set. Add GEMINI_API_KEY to your .env file.' };
  }
  try {
    const ai = getAI();
    const list = await ai.models.list();
    const names = [];
    for await (const m of list) names.push(m.name ?? m.displayName ?? '');
    return { running: true, model, modelInstalled: true, models: names.slice(0, 20), message: `Gemini ready (${model})` };
  } catch (e) {
    return { running: false, model, modelInstalled: false, models: [], message: `Gemini error: ${e.message?.slice(0, 80) ?? 'Unknown error'}` };
  }
}

import { normalizeSchema } from './schemaNormalizer.js';

function toGeminiTools(ollamaTools) {
  if (!ollamaTools?.length) return undefined;
  return [{
    functionDeclarations: ollamaTools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: normalizeSchema(t.function.parameters),
    })),
  }];
}

// ── Convert our message history → Gemini Content[] ──────────────────────────
function toGeminiHistory(messages) {
  const geminiMessages = [];
  let systemInstruction = '';

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content;
      continue;
    }
    if (msg.role === 'user') {
      geminiMessages.push({ role: 'user', parts: [{ text: msg.content || '' }] });
    } else if (msg.role === 'assistant') {
      const parts = [];
      if (msg.content) parts.push({ text: msg.content });
      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          const fcPart = {
            functionCall: {
              name: tc.function.name,
              args: typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : (tc.function.arguments ?? {}),
            },
          };
          if (tc.thoughtSignature) {
            fcPart.thoughtSignature = tc.thoughtSignature;
          }
          parts.push(fcPart);
        }
      }
      if (parts.length) geminiMessages.push({ role: 'model', parts });
    } else if (msg.role === 'tool') {
      geminiMessages.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.tool_name,
            response: { output: msg.content },
          },
        }],
      });
    }
  }
  return { systemInstruction, geminiMessages };
}

// ── Test harness runner (for unit tests using local mock server) ─────────────
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
  }).catch((e) => {
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

// ── Main chat function ──────────────────────────────────────────────────────
export async function chat({ messages, tools, signal, onToken, temperature = 0.2, numPredict = 2048 }) {
  // Use mock harness when running unit/integration tests
  if (config.NODE_ENV === 'test') {
    return chatTestMock({ messages, tools, signal, onToken });
  }

  const primaryModel = config.GEMINI_MODEL || 'gemini-3.6-flash';
  const ai = getAI();

  const { systemInstruction, geminiMessages } = toGeminiHistory(messages);
  const geminiTools = toGeminiTools(tools);

  const genConfig = {
    temperature,
    maxOutputTokens: numPredict,
    ...(geminiTools ? { tools: geminiTools } : {}),
  };

  const modelsToTry = [...new Set([primaryModel, 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.7-flash'])];

  let response;
  let lastError;

  for (const modelToUse of modelsToTry) {
    if (signal?.aborted) break;
    try {
      response = await ai.models.generateContent({
        model: modelToUse,
        contents: geminiMessages,
        config: {
          ...genConfig,
          ...(systemInstruction ? { systemInstruction } : {}),
        },
      });
      break;
    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError') throw e;
      const msg = e.message ?? String(e);
      if (msg.includes('API_KEY') || msg.includes('401')) {
        throw httpError(503, 'Invalid Gemini API key. Check GEMINI_API_KEY in your .env.', 'gemini_auth_error');
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw httpError(503, 'Gemini quota reached. Please check your plan.', 'gemini_rate_limit');
      }
      if (msg.includes('503') || msg.includes('404') || msg.includes('high demand')) {
        continue;
      }
      throw httpError(502, `Gemini error: ${msg.slice(0, 120)}`, 'gemini_error');
    }
  }

  if (!response && lastError) {
    const msg = lastError.message ?? String(lastError);
    throw httpError(503, `Gemini temporarily unavailable: ${msg.slice(0, 100)}`, 'gemini_unavailable');
  }

  const candidate = response?.candidates?.[0];
  if (!candidate) throw httpError(502, 'Gemini returned no candidates.', 'gemini_error');

  const toolCalls = [];
  let content = '';

  for (const part of candidate.content?.parts ?? []) {
    if (part.text) {
      content += part.text;
      onToken?.(part.text);
    }
    if (part.functionCall) {
      toolCalls.push({
        id: `call_${Date.now()}`,
        function: {
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        },
        thoughtSignature: part.thoughtSignature,
      });
    }
  }

  return { content: content.trim(), toolCalls };
}
