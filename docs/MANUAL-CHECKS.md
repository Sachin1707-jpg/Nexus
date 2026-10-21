# Manual checks to run on your machine

1. `ollama list` shows `qwen3:4b`. Open the app; the sidebar shows "qwen3:4b ready".
2. Assistant: "Kal assignment submit karna hai, task bana do." Expect a created task, confirmed in Google Tasks (needs Google connected).
3. "Woh task complete ho gaya." Expect the same task marked completed.
4. "Purane completed tasks delete kar do." Expect an approval card listing titles. Cancel it, then repeat and approve.
5. "Move tomorrow's meeting to Friday." Expect an approval card with the exact event. Check Google Calendar after approval.
6. Email: ask for a draft to a recipient, give the exact address, edit in the card, approve. Check Gmail Sent.
7. "Kal ghoomne jaa sakti hoon?" with a default location set. Expect forecast-based advice with a caveat.
8. "Check my laptop's health" and "Find large files in my Downloads folder" (with `APPROVED_DIRS` set).
9. Voice: mic in the composer (Chrome/Edge); voice mode; speak buttons; stop/pause/resume. Hindi voice installed? Check Settings.
10. "I am feeling low today. Can we talk?" Expect a warm reply with no task or tool list.
11. `npm run mcp:smoke` passes.
