# Veritas X: one server on http://127.0.0.1:8000 (FastAPI API + built React UI).
#   powershell -ExecutionPolicy Bypass -File launch\start.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path ".venv\Scripts\python.exe")) { throw "Run launch\setup.ps1 (or setup_veritas.bat) first." }
if (-not (Test-Path "frontend\dist\index.html")) {
    Write-Host "frontend/dist missing - building the UI..."
    Push-Location frontend; npm run build; Pop-Location
}
Write-Host "Veritas X  ->  http://127.0.0.1:8000   (API docs: http://127.0.0.1:8000/docs)   Ctrl+C to stop" -ForegroundColor Cyan
& .venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
