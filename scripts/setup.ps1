# One-time setup for Windows (PowerShell). Run from the project root: .\scripts\setup.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error "Install Node.js 22.13 or newer from https://nodejs.org"; exit 1 }
if ([version](node -v).TrimStart('v') -lt [version]"22.13.0") { Write-Error "Node 22.13+ is required (found $(node -v))."; exit 1 }
if (-not (Test-Path .env)) {
  $rand = { [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N') }
  (Get-Content .env.example) -replace '^SESSION_SECRET=.*', "SESSION_SECRET=$(& $rand)" -replace '^TOKEN_ENCRYPTION_KEY=.*', "TOKEN_ENCRYPTION_KEY=$(& $rand)" -replace '^MCP_AUTH_TOKEN=.*', "MCP_AUTH_TOKEN=$(& $rand)" | Set-Content .env
  Write-Host "Created .env with fresh random secrets."
}
npm install
npm run setup
if (Get-Command ollama -ErrorAction SilentlyContinue) { ollama pull qwen3:4b } else { Write-Warning "Ollama not found. Install from https://ollama.com then run: ollama pull qwen3:4b" }
npm run build
Write-Host "`nDone. Start with: npm start   then open http://localhost:8787"
