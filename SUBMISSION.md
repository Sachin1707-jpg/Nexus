# Hackathon submission pack: Amazon Developer, Alexa+ track

Deadline in your PDF: **24 Oct**. Items marked ✏️ need you, because they depend on your own experience or accounts.

## Requirement checklist (from the brief)

| Requirement | Status |
|---|---|
| Primary track: **Alexa+**, a self-hosted MCP server, spec **2025-11-25 or later**, **Streamable HTTP** | Done. `backend/src/mcp/server.js` uses `@modelcontextprotocol/sdk@1.32.1` (`StreamableHTTPServerTransport`, latest protocol `2025-11-25`), 28 tools, bearer auth, Origin check, schema-validated inputs |
| Repo must *call* the technology in code (import / entry point / loaded MCP config), not only mention it | Done. The server is mounted at `POST /mcp` (`backend/src/server.js`); the orchestrator uses a real MCP client (`backend/src/mcp/client.js`) for every tool call; `npm run mcp:smoke` exercises it as an external client |
| "Show your MCP server in action" in the demo | ✏️ Record it (script below) |
| Optional simulated Alexa+ experience | Included: **Alexa+ Lab** page (tool browser, live tool calls, simulated conversation) |
| GitHub repo: public with an open-source license **or** private shared with `testing@devpost.com` and the Amazon reviewers | MIT `LICENSE` included. ✏️ If you keep it private, add collaborators: `testing@devpost.com`, `chris-trag`, `knmeiss`, `giolaq`, `anishamalde`, `mosesroth`, `emersonsklar` (invites expire after 7 days, so add them at submission time) |
| Demo video under 3 minutes, public YouTube/Vimeo, English, no third-party trademarks or copyrighted music | ✏️ |
| Text description | Draft below |
| Product feedback on every tool/API/SDK used | Draft below ✏️ |
| Tracks and mini challenges entered | Alexa+; optional **Open Source** mini challenge (see below) |
| If the project existed before the hackathon, what you built during the window | ✏️ Say it is new, or describe what changed |
| Optional: feature requests, friction log (up to 10% judging bonus) | Template below ✏️ |

Each project can win one track prize and one mini challenge. **AWS Builder** is not claimed, because nothing here uses AWS services. Do not tick it.

**Open Source mini challenge** needs, in your form: the repo URL, your GitHub username, the contribution URL and a short description. A new public repo with this MIT license qualifies as the "new, additional open-source project". Create the repo during the hackathon window.

## Project description (draft)

**Nexus** is a local-first personal assistant that exposes everything it can do as a self-hosted **MCP server** (Streamable HTTP, spec 2025-11-25), so Alexa+ or any MCP client can use the same tools as its own web app. Twenty-eight tools cover Google Tasks, Calendar and Gmail, Open-Meteo weather and outing advice, system health, GitHub review and memory.

What makes it safe to hand to a voice assistant: tools that change things (send email, cancel an event, delete files, open a pull request) never act directly. They *propose* an action that a person must approve in the Nexus UI. The approval is bound to the exact content shown, expires, runs once, and the result is verified against the real service before it is reported as done. Voice and typed commands follow identical rules.

How it works: a React UI talks to an Express backend. The backend's orchestrator sends the user's message and a small, routed set of tools to a local Ollama model (qwen3:4b, thinking off, for speed), validates every tool call against its schema, and executes it through an MCP client against the `/mcp` endpoint. It understands English and Hinglish, including relative dates like "kal" and "Friday wali meeting".

## Demo video script (about 2m45s)

1. 0:00 Say what it is in one sentence. Show the **Alexa+ Lab** page: endpoint, spec version, 28 tools.
2. 0:20 Terminal: run `npm run mcp:smoke`. Eight PASS lines show an external client connecting, listing tools, being rejected without a token, and rejecting bad input.
3. 0:50 In Alexa+ Lab, call `system_get_health` live and show real numbers.
4. 1:10 Simulated Alexa+ conversation: "Alexa, which processes use the most memory?" Show the MCP tool names under the reply.
5. 1:40 The safety story: ask to stop a process or send an email. Show the approval card, edit the text (approval resets), approve, show "Done and verified".
6. 2:20 Hinglish: "Kal assignment submit karna hai, task bana do." then the voice mode orb.
7. 2:40 Repo URL and license.

If you can, also point a real Alexa+ preview or another MCP client at a tunnelled endpoint and show it listing tools. That is the strongest proof for this track.

## Product feedback ✏️ (edit with your real experience)

Facts verified while building:

- **MCP TypeScript SDK `@modelcontextprotocol/sdk` 1.32.1**, used for the server (`McpServer`, `registerTool`, `StreamableHTTPServerTransport`) and the client (`Client`, `StreamableHTTPClientTransport`). It exports `LATEST_PROTOCOL_VERSION = 2025-11-25`, so the spec requirement was easy to confirm in code. The older `server.tool()` overloads are marked deprecated in favour of `registerTool`.
- **Stateless mode** (`sessionIdGenerator: undefined`, one server and transport per request) was the simplest fit for an approval-gated tool server.
- **Ollama** `/api/chat` with `tools` and `think: false` for a free local model.
- **Open-Meteo** forecast and geocoding APIs need no key.

Answer for your form, in your words: what you used each for, what worked, what needs work, how onboarding felt, whether you would use it again. Mention that you did not use AWS services.

## Friction log ✏️ (optional, up to 10% bonus)

For each real problem you hit, write: task attempted, steps, expected vs actual, severity, workaround, actionable suggestion. Only include things that really happened to you, for example while connecting Alexa+ to your tunnelled endpoint or getting the first MCP handshake working.

## Before you submit

- [ ] Push to GitHub with `LICENSE` (never commit `.env`; `.gitignore` already excludes it)
- [ ] `npm test` and `npm run mcp:smoke` pass on your machine
- [ ] Walk through `docs/MANUAL-CHECKS.md`
- [ ] Record and upload the video (public, English, under 3 minutes)
- [ ] Fill the form: track Alexa+, mini challenge Open Source (optional), feedback
