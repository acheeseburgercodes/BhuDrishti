# Starts backend (uvicorn :8000) and frontend (vite :5173) detached, if not already listening.
# Logs go to <repo>\logs\. Safe to re-run: skips any service whose port is already up.
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

function Test-Port([int]$Port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

if (-not (Test-Port 8000)) {
    $py = Join-Path $Root "backend\.venv\Scripts\python.exe"
    Start-Process -FilePath $py `
        -ArgumentList "-m","uvicorn","main:app","--port","8000","--host","0.0.0.0" `
        -WorkingDirectory (Join-Path $Root "backend") -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $Logs "backend.out.log") `
        -RedirectStandardError (Join-Path $Logs "backend.err.log")
    Write-Output "backend: started"
} else { Write-Output "backend: already running" }

if (-not (Test-Port 5173)) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev -- --host 127.0.0.1 --port 5173" `
        -WorkingDirectory (Join-Path $Root "frontend") -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $Logs "frontend.out.log") `
        -RedirectStandardError (Join-Path $Logs "frontend.err.log")
    Write-Output "frontend: started"
} else { Write-Output "frontend: already running" }
