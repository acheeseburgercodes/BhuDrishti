param(
    [ValidateSet('Release', 'Debug')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Mobile = Join-Path $Root 'mobile'
$Android = Join-Path $Mobile 'android'
$Sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$Jdk = Join-Path $env:USERPROFILE '.jdks\temurin-17'
$Java = Join-Path $Jdk 'bin\java.exe'

if (-not (Test-Path -LiteralPath $Java)) {
    throw 'JDK 17 is required. Run scripts\get_jdk17.ps1 first.'
}
if (-not (Test-Path -LiteralPath $Sdk)) {
    throw "Android SDK not found at $Sdk. Install Android Studio command-line tools first."
}
if (-not (Test-Path -LiteralPath $Android)) {
    Push-Location $Mobile
    try { & npx expo prebuild --platform android --no-install }
    finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw "Expo prebuild failed with exit code $LASTEXITCODE." }
}

$env:JAVA_HOME = $Jdk
$env:ANDROID_HOME = $Sdk
$env:NODE_ENV = 'production'
$localProperties = Join-Path $Android 'local.properties'
Set-Content -LiteralPath $localProperties -Value ("sdk.dir=" + ($Sdk -replace '\\', '\\')) -Encoding ascii

$Task = if ($Configuration -eq 'Release') { 'assembleRelease' } else { 'assembleDebug' }
Push-Location $Android
try { & .\gradlew.bat $Task --no-daemon }
finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "Gradle $Task failed with exit code $LASTEXITCODE." }

$Variant = $Configuration.ToLowerInvariant()
$Apk = Join-Path $Android "app\build\outputs\apk\$Variant\app-$Variant.apk"
if (-not (Test-Path -LiteralPath $Apk)) { throw "Gradle succeeded but no APK was found at $Apk." }
$Item = Get-Item -LiteralPath $Apk
Write-Output "APK ready: $($Item.FullName) ($([math]::Round($Item.Length / 1MB, 1)) MB)"
