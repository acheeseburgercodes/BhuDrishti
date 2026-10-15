$ErrorActionPreference = 'Stop'
$Jdks = Join-Path $env:USERPROFILE '.jdks'
$Destination = Join-Path $Jdks 'temurin-17'
$Java = Join-Path $Destination 'bin\java.exe'

if (Test-Path -LiteralPath $Java) {
    & $Java -version
    Write-Output "JDK 17 is already available at $Destination"
    exit 0
}

New-Item -ItemType Directory -Force -Path $Jdks | Out-Null
$Archive = Join-Path $Jdks 'temurin17.zip'
$Extract = Join-Path $Jdks ("temurin-17-extract-" + [Guid]::NewGuid().ToString('N'))
$Url = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk'

& curl.exe --fail --location --retry 5 --retry-delay 5 --continue-at - --output $Archive $Url
if ($LASTEXITCODE -ne 0) { throw "JDK download failed with exit code $LASTEXITCODE." }
Expand-Archive -LiteralPath $Archive -DestinationPath $Extract -Force
$Inner = Get-ChildItem -LiteralPath $Extract -Directory | Select-Object -First 1
if (-not $Inner) { throw 'The JDK archive did not contain an install directory.' }
if (Test-Path -LiteralPath $Destination) { throw "Refusing to replace existing directory $Destination." }
Move-Item -LiteralPath $Inner.FullName -Destination $Destination

& $Java -version
Write-Output "JDK 17 installed at $Destination"
