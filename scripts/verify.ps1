# Runs every automated check: backend pytest, shared + mobile node tests, frontend vitest +
# production build, and a mobile Metro bundle. Exit code = number of failed steps.
# Usage (PowerShell, from anywhere):  .\scripts\verify.ps1 [-SkipMobileBundle]
param([switch]$SkipMobileBundle)
$Root = Split-Path -Parent $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"
$env:BHUDRISHTI_NO_DOTENV = "1"
$failed = 0

function Step($name, $dir, [scriptblock]$cmd) {
    Write-Output "==> $name"
    Push-Location $dir
    try { & $cmd; if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }; Write-Output "PASS $name" }
    catch { Write-Output "FAIL $name ($_)"; $script:failed++ }
    finally { Pop-Location }
}

Step "backend pytest" $Root { & (Join-Path $Root "backend\.venv\Scripts\python.exe") -m pytest -q }
Step "shared tests" (Join-Path $Root "shared") { npm test --silent }
Step "mobile tests" (Join-Path $Root "mobile") { npm test --silent }
Step "frontend tests" (Join-Path $Root "frontend") { npm test --silent }
Step "frontend build" (Join-Path $Root "frontend") { npm run build --silent }
if (-not $SkipMobileBundle) {
    Step "mobile bundle" (Join-Path $Root "mobile") {
        $env:CI = "1"; npx expo export --platform android --output-dir dist | Out-Null
        Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
    }
}
Write-Output "FAILED_STEPS=$failed"
exit $failed
