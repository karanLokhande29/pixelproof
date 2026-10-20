# Build a sanitized submission archive: source + docs only. Excludes .venv,
# node_modules, frontend/dist, build_artifacts (case evidence, results, logs,
# screenshots), checkpoints, caches and any secrets file.
#   powershell -ExecutionPolicy Bypass -File launch\package.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$stamp = Get-Date -Format "yyyyMMdd_HHmm"
$stage = Join-Path $root "dist_submission\veritas-x"
$zip = Join-Path $root "dist_submission\veritas-x_$stamp.zip"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

$excludeDirs = @(".venv", "node_modules", "dist", "build_artifacts", "checkpoints", "dist_submission",
                 "__pycache__", ".pytest_cache", "htmlcov", ".mypy_cache")
$excludeFiles = @("secrets.toml", ".env", "*.log", "*.pyc")
robocopy $root $stage /E /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

Compress-Archive -Path "$stage\*" -DestinationPath $zip -Force
Remove-Item -Recurse -Force $stage
$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "Created $zip ($size MB). Recipient runs setup_veritas.bat, then start_veritas.bat." -ForegroundColor Green
