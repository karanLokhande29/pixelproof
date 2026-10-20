# Veritas X one-time setup (Windows PowerShell 5.1+). Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File launch\setup.ps1
# Creates .venv, installs the upstream pins + API layer, installs and builds the UI.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$py = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $py) { throw "Python not found. Install Python 3.10-3.12 (verified: 3.12.10)." }
Write-Host "Python: $(python --version)"
if (-not (Test-Path ".venv\Scripts\python.exe")) { python -m venv .venv }
& .venv\Scripts\python.exe -m pip install --upgrade pip
& .venv\Scripts\python.exe -m pip install -r requirements.txt -r backend\requirements-api.txt
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

$node = (Get-Command npm -ErrorAction SilentlyContinue)
if (-not $node) { throw "Node.js/npm not found. Install Node 20+ (verified: 22.20.0)." }
Push-Location frontend
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm ci failed" }
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "frontend build failed" }
Pop-Location
Write-Host "`nSetup complete. Start with: start_veritas.bat  (then open http://127.0.0.1:8000)" -ForegroundColor Green
