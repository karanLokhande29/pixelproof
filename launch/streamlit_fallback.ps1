# The original upstream Streamlit app (unchanged), kept as a fallback UI.
#   powershell -ExecutionPolicy Bypass -File launch\streamlit_fallback.ps1   ->  http://localhost:8501
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
& .venv\Scripts\python.exe -m streamlit run app.py --server.port 8501
