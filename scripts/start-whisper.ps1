$root = Split-Path -Parent $PSScriptRoot
if (-not $env:WHISPER_MODEL) { $env:WHISPER_MODEL = "small" }
& "$root\local-transcription\.venv\Scripts\python.exe" "$root\local-transcription\server.py"
