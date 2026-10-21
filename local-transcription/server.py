"""Local speech-to-text service for Nexus (faster-whisper). Binds to localhost only; audio never leaves your machine."""
import io, json, os, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HOST = os.environ.get("WHISPER_HOST", "127.0.0.1")
PORT = int(os.environ.get("WHISPER_PORT", "8788"))
MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")      # tiny / base / small / medium (multilingual: handles Hindi + English)
COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")        # int8 = fast on CPU
MAX_BYTES = 25 * 1024 * 1024

_model = None
_lock = threading.Lock()

def get_model():
    global _model
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel
            print(f"Loading Whisper model '{MODEL_NAME}' ({COMPUTE})...", flush=True)
            _model = WhisperModel(MODEL_NAME, device="cpu", compute_type=COMPUTE)
        return _model

class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            return self._json(200, {"ok": True, "engine": "faster-whisper", "model": MODEL_NAME, "loaded": _model is not None})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/transcribe":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length", 0))
        if n <= 0 or n > MAX_BYTES:
            return self._json(400, {"error": "empty or too large"})
        data = self.rfile.read(n)
        lang = parse_qs(u.query).get("language", [None])[0]
        try:
            segments, info = get_model().transcribe(io.BytesIO(data), language=lang or None, vad_filter=True, beam_size=1)
            text = " ".join(s.text.strip() for s in segments).strip()
            self._json(200, {"text": text, "language": info.language, "language_probability": round(info.language_probability, 3)})
        except Exception as e:  # decoding errors etc.
            print("transcribe error:", type(e).__name__, file=sys.stderr)
            self._json(500, {"error": "transcription failed"})

    def log_message(self, *a):  # never log audio or transcripts
        pass

if __name__ == "__main__":
    print(f"Nexus local transcription on http://{HOST}:{PORT} (model: {MODEL_NAME})", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
