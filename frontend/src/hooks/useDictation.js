import { useCallback, useRef, useState } from 'react';
import { api } from '../services/api.js';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
/**
 * Speech-to-text. engine 'browser' uses Web Speech API; 'local' records audio and sends it to the local Whisper service.
 * status: idle | listening | transcribing | error
 */
export function useDictation({ onResult, lang = 'en-IN' }) {
  const [status, setStatus] = useState('idle'); const [error, setError] = useState(''); const [interim, setInterim] = useState('');
  const rec = useRef(null); const media = useRef(null); const chunks = useRef([]); const cancelled = useRef(false);

  const fail = (m) => { setError(m); setStatus('error'); setTimeout(() => setStatus((s) => (s === 'error' ? 'idle' : s)), 100); };
  const startBrowser = useCallback(() => {
    if (!SR) return fail('This browser has no built-in speech recognition. Use Chrome/Edge, or enable local Whisper.');
    const r = new SR(); r.lang = lang; r.interimResults = true; r.continuous = false; let finalText = '';
    cancelled.current = false;
    r.onresult = (e) => { let it = ''; for (const res of e.results) { if (res.isFinal) finalText += res[0].transcript; else it += res[0].transcript; } setInterim(it); };
    r.onerror = (e) => {
      const m = {
        'not-allowed': 'Microphone access was blocked. Allow it in the browser address bar.',
        'no-speech': 'No speech was detected. Try again.',
        'audio-capture': 'No microphone was found.',
        network: 'Browser speech recognition requires an internet connection (it sends audio to the browser vendor). Switch to "Local Whisper" in Settings → Speech input for fully offline STT.',
      }[e.error] ?? `Speech recognition error (${e.error}).`;
      fail(m);
    };
    r.onend = () => { setInterim(''); setStatus((s) => (s === 'listening' ? 'idle' : s)); if (!cancelled.current && finalText.trim()) onResult(finalText.trim()); };
    rec.current = r; setError(''); setStatus('listening'); r.start();
  }, [lang, onResult]);

  const startLocal = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return fail('Microphone is not available in this browser.');
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return fail(e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in the browser address bar.' : 'No microphone was found.'); }
    cancelled.current = false; chunks.current = [];
    const mr = new MediaRecorder(stream); media.current = mr;
    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cancelled.current) { setStatus('idle'); return; }
      const blob = new Blob(chunks.current, { type: mr.mimeType });
      if (blob.size < 1500) return fail('The recording was empty. Hold the mic a little longer and speak.');
      setStatus('transcribing');
      try { const r = await api('/voice/transcribe', { method: 'POST', raw: blob }); setStatus('idle'); onResult(r.text); }
      catch (e) { fail(e.message); }
    };
    setError(''); setStatus('listening'); mr.start();
  }, [onResult]);

  const start = useCallback((engine) => { if (status === 'listening' || status === 'transcribing') return; return engine === 'local' ? startLocal() : startBrowser(); }, [status, startLocal, startBrowser]);
  const stop = useCallback(() => { if (rec.current) rec.current.stop(); if (media.current?.state === 'recording') media.current.stop(); }, []);
  const cancel = useCallback(() => { cancelled.current = true; try { rec.current?.abort(); } catch {} if (media.current?.state === 'recording') media.current.stop(); setInterim(''); setStatus('idle'); }, []);
  return { status, error, interim, start, stop, cancel, browserSupported: Boolean(SR) };
}
