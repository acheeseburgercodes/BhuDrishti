# One-shot fault check for BhuDrishti. Prints PASS/FAIL lines; exit code = number of failures.
$Root = Split-Path -Parent $PSScriptRoot
$fail = 0
function Report($name, $ok, $detail) {
    if ($ok) { Write-Output "PASS $name $detail" } else { Write-Output "FAIL $name $detail"; $script:fail++ }
}

# 1. Backend endpoints
foreach ($p in "/api/health","/api/model","/api/nodes","/api/events") {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri ("http://127.0.0.1:8000" + $p)
        Report "backend$p" ($r.StatusCode -eq 200) ("HTTP " + $r.StatusCode)
    } catch { Report "backend$p" $false $_.Exception.Message }
}

# 2. Ingest round-trip (simulate-event exercises classify + broadcast + storage)
try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Method POST -Uri "http://127.0.0.1:8000/api/simulate-event" -ContentType "application/json" -Body "{}"
    Report "backend/simulate-event" ($r.StatusCode -eq 200) ("HTTP " + $r.StatusCode)
} catch { Report "backend/simulate-event" $false $_.Exception.Message }

# 3. Frontend serves and App.jsx transforms (catches JSX syntax errors that blank the page)
foreach ($p in "/","/src/App.jsx") {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 15 -Uri ("http://127.0.0.1:5173" + $p)
        Report "frontend$p" ($r.StatusCode -eq 200) ("HTTP " + $r.StatusCode)
    } catch { Report "frontend$p" $false $_.Exception.Message }
}

# 4. Static checks
$py = Join-Path $Root "backend\.venv\Scripts\python.exe"
$out = & $py -m py_compile (Join-Path $Root "backend\main.py") (Join-Path $Root "backend\model.py") (Join-Path $Root "backend\storage.py") (Join-Path $Root "scripts\esp32_bridge.py") 2>&1
Report "py_compile" ($LASTEXITCODE -eq 0) ($out -join " ")

$out = & node --check (Join-Path $Root "mobile\App.js") 2>&1
# node --check can't parse JSX; only flag non-JSX errors
$jsxOnly = ($out -join " ") -match "Unexpected token '<'"
Report "mobile/App.js" (($LASTEXITCODE -eq 0) -or $jsxOnly) ""

# 5. Recent backend errors
$err = Join-Path $Root "logs\backend.err.log"
if (Test-Path $err) {
    $tb = Select-String -Path $err -Pattern "Traceback|ERROR" | Select-Object -Last 3
    Report "backend-log" (-not $tb) (($tb | ForEach-Object { $_.Line }) -join " | ")
}

Write-Output "FAILURES=$fail"
exit $fail
