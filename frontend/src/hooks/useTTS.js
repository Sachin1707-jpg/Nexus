import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanForSpeech, chunkSpeech, guessLang } from '../services/speech.js';

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Load voices, waiting up to 1 s for async population (common on Windows). */
function loadVoices() {
  return new Promise((resolve) => {
    const v = speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    let done = false;
    const onchange = () => { if (!done) { done = true; resolve(speechSynthesis.getVoices()); } };
    speechSynthesis.addEventListener('voiceschanged', onchange);
    setTimeout(() => { if (!done) { done = true; resolve(speechSynthesis.getVoices()); } }, 1000);
  });
}

/** Single shared speaker: prevents overlapping speech; supports play/pause/resume/stop. */
export function useTTS(settings) {
  const [state, setState] = useState({ id: null, status: 'idle' }); // idle | speaking | paused
  const [voices, setVoices] = useState([]);
  const token = useRef(0);
  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load(); speechSynthesis.addEventListener('voiceschanged', load);
    return () => { speechSynthesis.removeEventListener('voiceschanged', load); speechSynthesis.cancel(); };
  }, []);
  const stop = useCallback(() => { token.current++; if (supported) speechSynthesis.cancel(); setState({ id: null, status: 'idle' }); }, []);
  const speak = useCallback(async (id, text, { onEnd } = {}) => {
    if (!supported) return false;
    stop(); const my = ++token.current;
    const clean = cleanForSpeech(text); if (!clean) return false;
    const lang = guessLang(clean);
    // Wait for voices if not loaded yet (Windows async loading)
    const availableVoices = voices.length ? voices : await loadVoices();
    if (my !== token.current) return false; // was cancelled while waiting
    const pref = availableVoices.find((v) => v.name === settings.voiceName);
    const voice = pref ?? availableVoices.find((v) => v.lang === lang) ?? availableVoices.find((v) => v.lang.startsWith(lang.slice(0, 2)));
    const chunks = chunkSpeech(clean); let i = 0;
    setState({ id, status: 'speaking' });
    const next = () => {
      if (my !== token.current) return;
      if (i >= chunks.length) { setState({ id: null, status: 'idle' }); onEnd?.(); return; }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      if (voice) u.voice = voice; u.lang = voice?.lang ?? lang;
      u.rate = settings.speechRate ?? 1; u.pitch = settings.speechPitch ?? 1; u.volume = settings.speechVolume ?? 1;
      u.onend = next; u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') setState({ id: null, status: 'idle' }); };
      speechSynthesis.speak(u);
    };
    next(); return true;
  }, [voices, settings.voiceName, settings.speechRate, settings.speechPitch, settings.speechVolume, stop]);
  const pause = useCallback(() => { speechSynthesis.pause(); setState((s) => ({ ...s, status: 'paused' })); }, []);
  const resume = useCallback(() => { speechSynthesis.resume(); setState((s) => ({ ...s, status: 'speaking' })); }, []);
  return { supported, voices, state, speak, stop, pause, resume };
}
