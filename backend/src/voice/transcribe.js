import Groq from 'groq-sdk';
import { config } from '../config.js';
import { httpError } from '../security/paths.js';
import { Readable } from 'node:stream';

let _groq = null;
function getGroq() {
  if (!_groq) {
    if (!config.GROQ_API_KEY) return null;
    _groq = new Groq({ apiKey: config.GROQ_API_KEY });
  }
  return _groq;
}

export async function whisperStatus() {
  if (config.GROQ_API_KEY) {
    return { available: true, provider: 'groq', message: `Groq Whisper transcription ready (whisper-large-v3)` };
  }
  // Fall back to local Whisper check
  try {
    const r = await fetch(`${config.WHISPER_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return { available: false, message: 'Local transcription service responded with an error.' };
    return { available: true, provider: 'whisper', ...(await r.json()) };
  } catch {
    return { available: false, provider: 'none', message: 'No transcription service available. Add GROQ_API_KEY or start Whisper.' };
  }
}

export async function transcribe(buffer, contentType, language) {
  if (!buffer?.length || buffer.length < 1200) throw httpError(400, 'The recording is empty or too short.', 'empty_audio');

  // ── Groq Whisper audio transcription ───────────────────────────────────────
  if (config.GROQ_API_KEY) {
    const groq = getGroq();
    const mimeType = (contentType || 'audio/webm').split(';')[0].trim();

    // Determine file extension from MIME type for Groq's file upload
    const extMap = {
      'audio/webm': 'webm',
      'audio/ogg': 'ogg',
      'audio/mp4': 'mp4',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/flac': 'flac',
      'audio/x-m4a': 'm4a',
    };
    const ext = extMap[mimeType] || 'webm';

    try {
      // Groq SDK accepts a File-like object; create one from the buffer
      const audioBlob = new Blob([buffer], { type: mimeType });
      const audioFile = new File([audioBlob], `audio.${ext}`, { type: mimeType });

      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3',
        ...(language ? { language } : {}),
        response_format: 'json',
        temperature: 0,
      });

      const text = transcription?.text?.trim();
      if (!text) throw httpError(422, 'No speech was detected in the recording.', 'no_speech');
      return { text, language: language || 'auto', confidence: 1.0, provider: 'groq' };
    } catch (e) {
      if (e.status || e.expose) throw e; // Re-throw our own errors
      throw httpError(502, `Groq transcription failed: ${e.message?.slice(0, 80)}`, 'groq_error');
    }
  }

  // ── Fallback: local Whisper ─────────────────────────────────────────────────
  let r;
  try {
    r = await fetch(`${config.WHISPER_URL}/transcribe${language ? `?language=${encodeURIComponent(language)}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
      body: buffer,
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw httpError(503, 'No transcription service available. Add GROQ_API_KEY to your .env, or start Whisper.', 'whisper_down');
  }
  if (!r.ok) throw httpError(502, 'Transcription failed.', 'whisper_error');
  const j = await r.json();
  if (!j.text?.trim()) throw httpError(422, 'No speech was detected in the recording.', 'no_speech');
  return { text: j.text.trim(), language: j.language, confidence: j.language_probability, provider: 'whisper' };
}
