import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { httpError } from '../security/paths.js';

let _ai = null;
function getAI() {
  if (!_ai) {
    if (!config.GEMINI_API_KEY) return null;
    _ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
  return _ai;
}

export async function whisperStatus() {
  if (config.GEMINI_API_KEY) {
    return { available: true, provider: 'gemini', message: `Gemini transcription ready (${config.GEMINI_MODEL})` };
  }
  // Fall back to local Whisper check
  try {
    const r = await fetch(`${config.WHISPER_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return { available: false, message: 'Local transcription service responded with an error.' };
    return { available: true, provider: 'whisper', ...(await r.json()) };
  } catch {
    return { available: false, provider: 'none', message: 'No transcription service available. Add GEMINI_API_KEY or start Whisper.' };
  }
}

export async function transcribe(buffer, contentType, language) {
  if (!buffer?.length || buffer.length < 1200) throw httpError(400, 'The recording is empty or too short.', 'empty_audio');

  // ── Gemini audio transcription ──────────────────────────────────────────
  if (config.GEMINI_API_KEY) {
    const ai = getAI();
    // Convert buffer to base64
    const base64Audio = Buffer.from(buffer).toString('base64');
    const mimeType = (contentType || 'audio/webm').split(';')[0].trim();

    try {
      const response = await ai.models.generateContent({
        model: config.GEMINI_MODEL,
        contents: [{
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: language
                ? `Transcribe this audio recording accurately in ${language}. Output only the spoken text, nothing else.`
                : 'Transcribe this audio recording accurately. Output only the spoken text, nothing else.',
            },
          ],
        }],
        config: { temperature: 0, maxOutputTokens: 512 },
      });

      const text = response?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
      if (!text) throw httpError(422, 'No speech was detected in the recording.', 'no_speech');
      return { text, language: language || 'auto', confidence: 1.0, provider: 'gemini' };
    } catch (e) {
      if (e.status || e.expose) throw e; // Re-throw our own errors
      throw httpError(502, `Gemini transcription failed: ${e.message?.slice(0, 80)}`, 'gemini_error');
    }
  }

  // ── Fallback: local Whisper ─────────────────────────────────────────────
  let r;
  try {
    r = await fetch(`${config.WHISPER_URL}/transcribe${language ? `?language=${encodeURIComponent(language)}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
      body: buffer,
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw httpError(503, 'No transcription service available. Add GEMINI_API_KEY to your .env, or start Whisper.', 'whisper_down');
  }
  if (!r.ok) throw httpError(502, 'Transcription failed.', 'whisper_error');
  const j = await r.json();
  if (!j.text?.trim()) throw httpError(422, 'No speech was detected in the recording.', 'no_speech');
  return { text: j.text.trim(), language: j.language, confidence: j.language_probability, provider: 'whisper' };
}
