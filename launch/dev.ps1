# Development: API on :8000 in a new window, Vite dev server (hot reload) on :5173.
#   powershell -ExecutionPolicy Bypass -File launch\dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"
Write-Host "API starting in a new window on :8000. UI -> http://127.0.0.1:5173" -ForegroundColor Cyan
Set-Location frontend
npx vite --host 127.0.0.1 --port 5173 --strictPort
