# Nexus ⚡

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22.13+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js 22.13+" />
  <img src="https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-6.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/MCP_Protocol-2025--11--25-FF9900?style=for-the-badge&logo=anthropic&logoColor=white" alt="MCP Protocol 2025-11-25" />
  <img src="https://img.shields.io/badge/Groq-Cloud_API-F05A28?style=for-the-badge&logo=fastapi&logoColor=white" alt="Groq Cloud API" />
  <img src="https://img.shields.io/badge/Tests-51%20Passed-brightgreen?style=for-the-badge" alt="Tests 51 Passed" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" />
</p>

<p align="center">
  <strong>A local-first personal AI assistant powered by Groq Cloud and a self-hosted Model Context Protocol (MCP) Streamable HTTP server, featuring zero-trust human-in-the-loop approvals, multilingual voice chat, and deep personal productivity integrations.</strong>
</p>

<p align="center">
  <em>Built for the <strong>Amazon Developer Hackathon (Alexa+ Track)</strong> with self-hosted MCP tool support and interactive simulated Alexa+ experience.</em>
</p>

---

## 📑 Table of Contents

- [Key Highlights](#-key-highlights)
- [Architecture & Request Lifecycle](#-architecture--request-lifecycle)
- [Interactive UI Modules](#-interactive-ui-modules)
- [MCP Tool Registry (30 Tools)](#-mcp-tool-registry-30-tools)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Quickstart (PowerShell)](#quickstart-windows-powershell)
  - [Manual Setup (All Platforms)](#manual-setup-windows--macos--linux)
- [Environment Configuration](#-environment-configuration)
- [MCP Server & Alexa+ Lab](#-mcp-server--alexa-lab)
  - [External Client Connection](#external-client-connection)
  - [Running the Smoke Test](#running-the-smoke-test)
  - [Tunneling for Alexa+](#tunneling-for-alexa)
- [Security & Sandboxing Model](#-security--sandboxing-model)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Project Directory Structure](#-project-directory-structure)
- [License](#-license)

---

## 🌟 Key Highlights

- ⚡ **Ultra-Fast Groq Cloud Inference**: Powered by `qwen/qwen3.8-27b` for sub-second tool-calling reasoning and `whisper-large-v3` for speech-to-text. Includes local Ollama mock fallback for offline development and testing.
- 🔌 **Self-Hosted Model Context Protocol (MCP) Server**: Built strictly according to the official `@modelcontextprotocol/sdk` (protocol specification **2025-11-25**, Streamable HTTP transport at `POST /mcp`), exposing 30 production tools to Alexa+ and external agents.
- 🛡️ **Zero-Trust Human-in-the-Loop Approvals**: Consequential operations (deleting files, terminating processes, dispatching emails, cancelling calendar events, creating pull requests) never execute autonomously. They enter a cryptographic proposal state requiring browser approval.
- 🗣️ **Multilingual & Hinglish Intelligence**: Understands mixed English and Hinglish vernacular natively, including contextual relative time expressions such as *"kal subah 10 baje team meeting schedule karo"* or *"Friday wali meeting cancel kar do"*.
- 🧭 **Deterministic Tool Routing**: Intelligent pre-classifier routes each query to only the relevant 2–8 tools out of 30, dramatically reducing token usage, avoiding latency, and eliminating model hallucination.
- 🔒 **Enterprise-Grade Security Sandbox**:
  - AES-256-GCM encrypted OAuth token vault.
  - HttpOnly signed session cookies with CSRF validation.
  - Path-traversal and symlink protection restricted to configured `APPROVED_DIRS`.
  - Honesty guard replacing unverified model success claims.
- 🧪 **51 Automated Test Suites**: Comprehensive test coverage across security, MCP protocol integrity, SSE token streaming, and schema normalization.

---

## 🏗 Architecture & Request Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│                          React Frontend (Vite)                         │
│   (Assistant, Calendar, Email, Tasks, System, GitHub, Alexa+ Lab)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ SSE / HTTP JSON
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Express API Orchestrator                        │
│   - CSRF & Session Guard     - Intent Router (2-8 tools selected)      │
│   - Rate Limiter             - Honesty & Audit Guards                  │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
       Chat / Audio │                               │ MCP Tool Calls
                    ▼                               ▼
       ┌─────────────────────────┐     ┌─────────────────────────────────┐
       │     Groq Cloud API      │     │  MCP Server (Streamable HTTP)   │
       │  • qwen/qwen3.8-27b     │     │  • Specification: 2025-11-25    │
       │  • whisper-large-v3     │     │  • Mounted at: POST /mcp        │
       │  (Ollama mock fallback) │     │  • 30 Registered Tools          │
       └─────────────────────────┘     └────────────────┬────────────────┘
                                                        │
                      ┌─────────────────────────────────┴─────────────────────────────────┐
                      ▼                                                                   ▼
       ┌──────────────────────────────┐                                    ┌──────────────────────────────┐
       │       Read-Only Tools        │                                    │     Approval-Gated Tools     │
       │  (Calendar List, Email Read, │                                    │ (Send Email, Delete Files,   │
       │   Weather, System Health)    │                                    │  Kill Process, Create PR)    │
       └──────────────┬───────────────┘                                    └──────────────┬───────────────┘
                      │                                                                   │
                      ▼                                                                   ▼
       ┌──────────────────────────────┐                                    ┌──────────────────────────────┐
       │   External Service APIs      │                                    │   SQLite Approval Store      │
       │ (Google, GitHub, Open-Meteo) │                                    │ (HMAC Hash, Expiry, One-Time)│
       └──────────────────────────────┘                                    └──────────────────────────────┘
```

---

## 💻 Interactive UI Modules

Nexus features a responsive, desktop-and-mobile optimized dashboard with 11 specialized views:

| View | Purpose |
|---|---|
| **🤖 Assistant** | Real-time conversational interface with streaming tokens, tool status chips, and voice recording orb. |
| **📊 Overview** | Command center displaying real-time system metrics, pending action approvals, and daily schedules. |
| **✅ Tasks** | Two-way Google Tasks manager with filtering, list switching, completion toggling, and task creation. |
| **📅 Calendar** | Agenda and week views powered by Google Calendar with conflict detection and automated event drafts. |
| **📬 Email** | Thread-based Gmail search, preview, and safe draft composition with approval requirements before dispatch. |
| **🌤️ Weather** | Live weather forecasts and intelligent outdoor planning advice powered by the keyless Open-Meteo API. |
| **💻 System** | Real-time hardware telemetry: CPU load, memory usage, battery health degradation, and sandboxed file scanning. |
| **🐙 GitHub** | Repository explorer, commit diff analysis, automated code reviews, and pull request draft generation. |
| **💡 Insights** | Long-term memory reflection tracking productivity patterns, focus hours, and weekly sentiment. |
| **🧪 Alexa+ Lab** | Dedicated test sandbox to inspect the `/mcp` endpoint, test individual tools, and simulate voice conversations. |
| **⚙️ Settings** | Central hub for OAuth integrations, voice speed/pitch tuning, memory retention policies, and theme modes. |

---

## 🛠 MCP Tool Registry (30 Tools)

All tools are declared once in `backend/src/tools/` and exposed via both the internal orchestrator and the external `/mcp` endpoint:

| Category | Tools | Risk Level | Description |
|---|---|---|---|
| **Tasks** | `tasks_list`, `tasks_create`, `tasks_update`, `tasks_delete` | Read / Write | Google Tasks integration for viewing, adding, modifying, and safely removing tasks. |
| **Calendar** | `calendar_list_events`, `calendar_create_event`, `calendar_update_event`, `calendar_delete_event` | Read / Write | Google Calendar integration for agenda reviews, scheduling, and event management. |
| **Email** | `gmail_search`, `gmail_read_thread`, `gmail_create_draft`, `gmail_propose_send` | Read / **Approval** | Gmail client. Reading/drafting is immediate; sending an email requires browser approval. |
| **Weather** | `weather_forecast`, `weather_outing_advice` | Read | Global weather forecasts and outdoor activity recommendations via Open-Meteo. |
| **System** | `system_get_health`, `system_list_processes`, `system_find_large_files`, `system_maintenance_recommendations`, `system_propose_delete_files`, `system_propose_kill_process` | Read / **Approval** | Diagnostics (CPU, RAM, Battery) + large file cleaner & process killer requiring approval. |
| **GitHub** | `github_list_repos`, `github_read_repo_tree`, `github_get_file_content`, `github_compare_commits`, `github_review_code`, `github_prepare_pr` | Read / **Approval** | Code intelligence, commit diffing, static security reviews, and PR creation. |
| **Memory** | `memory_save`, `memory_list` | Read / Write | Cross-session associative memory retrieval and persistence. |
| **News** | `news_get_latest` | Read | Aggregated technology and software engineering headlines. |
| **Action** | `action_get_status` | Read | Query execution status and verification proofs for pending/executed actions. |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v22.13.0` or higher ([Download](https://nodejs.org))
- **Groq API Key**: Free tier available at [console.groq.com](https://console.groq.com)
- **Git**

### Quickstart (Windows PowerShell)

Run the automated setup script from the project root:

```powershell
.\scripts\setup.ps1
npm start
```

Visit **http://localhost:8787** in your browser.

---

### Manual Setup (Windows / macOS / Linux)

#### 1. Clone the repository
```bash
git clone https://github.com/Sachin1707-jpg/Nexus.git
cd Nexus
```

#### 2. Configure environment variables
Create a `.env` file in the root directory by copying `.env.example`:
```bash
cp .env.example .env
```
Fill in your `GROQ_API_KEY` in `.env`:
```env
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=qwen/qwen3.8-27b
```

#### 3. Install dependencies
```bash
npm install
npm run setup
```

#### 4. Launch development servers
```bash
npm run dev
```

- **Frontend UI**: http://localhost:5173
- **Backend API & MCP Server**: http://127.0.0.1:8787

---

## ⚙️ Environment Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Express server port. |
| `HOST` | `127.0.0.1` | Local loopback bind address. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origin for Vite dev server. |
| `TIMEZONE` | `Asia/Kolkata` | Timezone for relative date calculations and calendar queries. |
| `SESSION_SECRET` | *(Generated)* | Random 64-char key for signing session cookies. |
| `TOKEN_ENCRYPTION_KEY` | *(Generated)* | Random key for AES-256-GCM encryption of stored OAuth tokens. |
| `MCP_AUTH_TOKEN` | *(Generated)* | Secret Bearer token required for external MCP connections. |
| `GROQ_API_KEY` | `""` | Groq Cloud API Key for high-speed completions & STT. |
| `GROQ_MODEL` | `qwen/qwen3.8-27b` | Primary chat LLM (`qwen/qwen3.8-27b` / `openai/gpt-oss-120b`). |
| `GOOGLE_CLIENT_ID` | `""` | Google Cloud OAuth Web Application Client ID. |
| `GOOGLE_CLIENT_SECRET`| `""` | Google Cloud OAuth Client Secret. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8787/api/auth/google/callback` | OAuth callback URI registered in Google Console. |
| `GITHUB_TOKEN` | `""` | GitHub Personal Access Token (PAT) for repository and PR tools. |
| `DEFAULT_LOCATION` | `noida` | Default city for weather queries when omitted by user. |
| `APPROVED_DIRS` | `""` | Semicolon-delimited directory whitelist for safe filesystem access. |
| `NEWS_API_KEY` | `""` | Optional API key for tech news headlines. |
| `WHISPER_URL` | `http://127.0.0.1:8788` | Optional fallback local Python Whisper server. |

---

## 🔌 MCP Server & Alexa+ Lab

Nexus implements the **Model Context Protocol (MCP)** specification (`2025-11-25`) with **Streamable HTTP transport**.

### External Client Connection

External MCP clients (such as Alexa+ or desktop MCP tools) connect via:
- **Endpoint**: `POST http://127.0.0.1:8787/mcp`
- **Header**: `Authorization: Bearer <MCP_AUTH_TOKEN>`
- **Content-Type**: `application/json`

### Running the Smoke Test

Validate the MCP server as an external client:

```bash
# Set your token in the terminal session
npm run mcp:smoke
```

The test validates:
- [x] Unauthenticated request rejection (401 Unauthorized)
- [x] Protocol initialization handshake
- [x] Listing all 30 available tool schemas
- [x] Invoking a read-only tool (`system_get_health`)
- [x] Schema enforcement and argument validation

### Tunneling for Alexa+

Because the backend binds securely to `127.0.0.1`, external services like Alexa+ need a secure tunnel to reach your local instance during testing:

```bash
# Using Cloudflare Tunnel:
cloudflared tunnel --url http://127.0.0.1:8787

# Or using ngrok:
ngrok http 8787
```

*Provide your public tunnel URL with your secret `MCP_AUTH_TOKEN` to Alexa+.*

---

## 🛡️ Security & Sandboxing Model

Nexus was designed with a **defense-in-depth security model**:

1. **Cryptographic Action Approval**: Consequential write tools generate an action proposal. The server computes a SHA-256 HMAC hash over the canonical JSON payload. If the payload is modified, the hash changes and approval is invalidated. Actions expire within 15 minutes and can only be executed once.
2. **Post-Execution Verification**: An action is never reported as "done" based solely on the model's claim. Nexus directly queries the destination service (e.g., verifying that a task exists in Google Tasks) before confirming success.
3. **Honesty Guard**: If a model generates text claiming an action succeeded without executing a verified tool call, the orchestrator intercepts the response and corrects it.
4. **Filesystem Sandboxing**: File inspection and deletion are strictly constrained to directories enumerated in `APPROVED_DIRS`. All paths are verified against traversal attacks (`../`) and symlink escapes.
5. **Secret Redaction**: Internal audit logs automatically mask authorization headers, API keys, and sensitive tokens.

---

## 🧪 Testing & Quality Assurance

Nexus includes a comprehensive automated test suite testing the orchestrator, tool registry, security boundaries, and protocol compliance.

```bash
npm test --prefix backend
```

```
✔ execute is refused until approved
✔ approval with a stale/wrong hash is rejected
✔ editing payload invalidates a previous approval
✔ CSRF: state-changing request without token is rejected
✔ Origin check: foreign origin is rejected
✔ MCP endpoint requires bearer token and rejects foreign origin
✔ orchestrator selects a tool, calls it through MCP and reports real data
✔ only routed tool domains are exposed to the model
✔ streaming: stream_reset fires before tokens on no-tool path
✔ schemaNormalizer: normalizes all MCP tools without $ref remaining
✔ relative dates: English + Hinglish ("kal", "Friday wali meeting")
✔ path traversal and symlink escape are blocked
✔ token encryption round-trips and is not plaintext
...
ℹ tests 51 | pass 51 | fail 0 | duration_ms 7601
```

---

## 📁 Project Directory Structure

```
Nexus/
├── backend/
│   ├── src/
│   │   ├── database/        # SQLite connection, schema & migrations
│   │   ├── integrations/    # Google (Tasks/Calendar/Gmail), GitHub, Weather, News
│   │   ├── mcp/             # MCP Server & Client implementation (Streamable HTTP)
│   │   ├── middleware/      # Error handlers, rate limiters, security guards
│   │   ├── orchestrator/    # LLM turn loop, Hinglish date parser, domain router
│   │   ├── routes/          # REST endpoints (/api/chat, /bootstrap, /settings)
│   │   ├── security/        # AES-256-GCM encryption, CSRF tokens, session manager
│   │   ├── services/        # Approval state machine, audit log, conversations
│   │   ├── tools/           # 30 MCP tool definitions & schema definitions
│   │   ├── voice/           # Groq Whisper audio transcription
│   │   ├── config.js        # Zod environment schema validation
│   │   └── server.js        # Express application factory & startup
│   ├── tests/               # 51 unit & integration tests
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # ActionCard, ChatInput, Navigation, VoiceOrb
│   │   ├── pages/           # 11 application views (Assistant, AlexaLab, etc.)
│   │   ├── services/        # API client, EventSource SSE streaming helper
│   │   └── styles/          # Dark/light theme design system
│   └── vite.config.js
├── local-transcription/     # Optional standalone Python Whisper microservice
├── scripts/                 # PowerShell automated setup & launch scripts
├── .env.example             # Clean environment variable template
├── SUBMISSION.md            # Hackathon track documentation & demo script
└── package.json             # Root workspace orchestrator (concurrently)
```

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
