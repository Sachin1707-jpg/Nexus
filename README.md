# Nexus

A local-first personal AI assistant: chat and voice (English and Hinglish), tasks, calendar, email, weather advice, reflective insights, system health and GitHub review, all behind one **MCP server (Streamable HTTP, spec 2025-11-25)** and a backend-enforced approval system.

Built for the **Amazon Developer hackathon, Alexa+ track** (self-hosted MCP server) with an optional simulated Alexa+ experience. See [`SUBMISSION.md`](SUBMISSION.md).

## Quick start (Windows PowerShell)

Prerequisites: Node.js 22.13+, [Ollama](https://ollama.com).

```powershell
.\scripts\setup.ps1     # creates .env with random secrets, installs deps, pulls the model, builds the UI
npm start               # http://localhost:8787
```

Development with hot reload: `npm run dev` (UI on http://localhost:5173, API on :8787).

Everything works without paid APIs. Google, GitHub and local Whisper are optional and shown as "not connected" until configured; Nexus never shows sample data in their place.

## Model: fast and free

Default `qwen3:4b` through Ollama with **thinking disabled** (`OLLAMA_THINK=false`), a small context and short outputs, which keeps replies quick on a laptop. Nexus also only shows the model the 2 to 8 tools relevant to your sentence (a deterministic router), which matters more for a 4B model than raw size.

| Need | Model |
|---|---|
| Faster / weaker laptop | `qwen3:1.7b` |
| Default | `qwen3:4b` |
| Better reasoning, slower | `qwen3:8b`, or turn on "Reasoning mode" in Settings |

Change it in Settings (or `OLLAMA_MODEL`). Run `ollama pull <model>` first.

## Architecture

```
React UI ──HTTP/SSE──▶ Express API ──▶ Orchestrator ──▶ Ollama (/api/chat, tools)
                           │               │
                           │               └─ MCP client ──Streamable HTTP──▶ /mcp  (MCP server, 28 tools)
                           │                                                      │
                           ▼                                                      ▼
                     Approval service ◀── "propose" tools ─────────────── Tool handlers ─▶ Google / Open-Meteo / GitHub / OS
                     SQLite (conversations, pending actions, audit, encrypted tokens)
```

- **MCP is the real tool interface.** The orchestrator and the UI pages call tools through the MCP client at `/mcp`; external clients (Alexa+) use the same endpoint. Tool definitions live once in `backend/src/tools/`.
- **Approval service** (`backend/src/services/approvals.js`): consequential tools only *propose*. Each pending action has an id, owning session, payload hash, expiry and execution state. Editing the payload resets approval; approval is bound to the hash the user saw; execution is atomic (once only) and re-validated; every result is verified against the real service before it is reported as done. Voice and typed commands follow the same path.
- **Honesty guard**: a reply that claims an action was done without a tool result is replaced.
- **Security**: bearer-protected MCP, origin checks, CSRF token, rate limits, httpOnly session cookie, AES-256-GCM encrypted OAuth tokens, path-traversal and symlink-safe file access limited to `APPROVED_DIRS`, no model-generated shell commands, log redaction.

## MCP server

`POST http://127.0.0.1:8787/mcp` with `Authorization: Bearer <MCP_AUTH_TOKEN>` (stateless, JSON-RPC over Streamable HTTP). Verify it as an external client would:

```powershell
$env:MCP_AUTH_TOKEN = "<value from .env>"
npm run mcp:smoke
```

The server binds to `127.0.0.1` only. To let Alexa+ reach it, publish it yourself through a tunnel or reverse proxy you control (for example Cloudflare Tunnel or ngrok), keep `MCP_AUTH_TOKEN` long and secret, and revoke the tunnel when finished. Do not expose it without the token.

## Integrations

| Feature | Setup |
|---|---|
| Google Tasks, Calendar, Gmail | Google Cloud Console → OAuth client (Web), add redirect `http://localhost:8787/api/auth/google/callback`, enable Tasks, Calendar and Gmail APIs, put id and secret in `.env`, then Settings → Connect |
| GitHub | Fine-grained token, read-only to start, `GITHUB_TOKEN` in `.env`. Writes (pull requests) need extra permission and always need your approval |
| Weather | Open-Meteo, no key |
| System health | Built in. Add folders to `APPROVED_DIRS` for large-file scans and cleanup |
| Local speech-to-text (optional) | `.\scripts\setup-whisper.ps1`, then `.\scripts\start-whisper.ps1`, then choose "Local Whisper" in Settings |
| Speech output | Browser speech synthesis, no setup. Install a Hindi voice in Windows for Hindi |

## Tests

```powershell
npm test            # 34 backend tests (approvals, dates/timezones, routing, security, orchestrator over real MCP)
npm run mcp:smoke   # needs the server running and MCP_AUTH_TOKEN set
```

Tests use mocked Ollama and temporary databases. They never touch real email, calendars, files or GitHub.

### What is and is not verified

Verified here: the tests above, the MCP server from an external client, the production UI build, and the rendered pages at desktop and mobile widths (no runtime errors). **Not verified in the build environment** because it has no Ollama, Google account or GitHub access: real `qwen3:4b` tool-calling quality, live Google/GitHub API calls, microphone and speech engines, and Windows-specific diagnostics (PowerShell paths are implemented but only the Linux paths were executed). Run through the checklist in `docs/MANUAL-CHECKS.md` on your machine.

## Troubleshooting

- *"Ollama is not running"*: start the Ollama app or `ollama serve`.
- *Model missing*: `ollama pull qwen3:4b`.
- *Google "access blocked"*: add your account as a test user on the OAuth consent screen.
- *Microphone blocked*: allow it in the browser address bar. Browser recognition needs Chrome or Edge.
- *Port in use*: change `PORT` in `.env`.

## License

MIT, see [LICENSE](LICENSE).
