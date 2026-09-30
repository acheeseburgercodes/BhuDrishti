# Restarts the API on :8000 detached (WMI launch, so the caller never inherits its pipes).
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$conn = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
foreach ($c in $conn) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
$py = Join-Path $Root "backend\.venv\Scripts\python.exe"
$backend = Join-Path $Root "backend"
$cmd = "cmd.exe /c cd /d `"$backend`" && `"$py`" -m uvicorn main:app --port 8000 --host 0.0.0.0 1>`"$Logs\backend.out.log`" 2>`"$Logs\backend.err.log`""
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd } | Out-Null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try { $h = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 3; Write-Output ("backend up: mode=" + $h.mode + " persistence=" + $h.persistence.state); exit 0 } catch {}
}
Write-Output "backend did not answer within 20s; see logs\backend.err.log"
exit 1
