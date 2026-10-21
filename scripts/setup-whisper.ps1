# Creates an isolated Python venv for local speech-to-text (optional feature).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location "$root\local-transcription"
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Error "Python 3.9+ is required. Install from https://www.python.org/downloads/"; exit 1 }
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt

# Pre-download the model so the first voice recording doesn't pause for ~30 seconds.
Write-Host "Pre-downloading the Whisper 'small' model (about 500 MB, runs once)..." -ForegroundColor Cyan
$env:WHISPER_MODEL = "small"
$proc = Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "server.py" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
for ($i = 0; $i -lt 10; $i++) {
  try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:8788/health" -TimeoutSec 5 -ErrorAction Stop; if (($r.Content | ConvertFrom-Json).ok) { break } } catch {}
  Start-Sleep -Seconds 3
}
$proc.Kill()
Write-Host "Done. Start the transcription service with: .\scripts\start-whisper.ps1" -ForegroundColor Green
Write-Host "Then choose 'Local Whisper' in Settings → Speech input to use fully-offline STT." -ForegroundColor Green
