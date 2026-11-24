param(
    [ValidateSet('dev', 'build', 'test', 'check')][string]$Action = 'dev',
    [switch]$Portable
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$localCargo = Join-Path $projectRoot '.tools\cargo'
if (Test-Path -LiteralPath (Join-Path $localCargo 'bin\cargo.exe')) {
    $env:CARGO_HOME = $localCargo
    $env:RUSTUP_HOME = Join-Path $projectRoot '.tools\rustup'
    $env:PATH = "$localCargo\bin;$env:PATH"
}

$manifest = Join-Path $projectRoot 'src-tauri\Cargo.toml'
if ($Action -in @('test', 'check')) {
    & cargo $Action --manifest-path $manifest
    exit $LASTEXITCODE
}

if ($Action -eq 'dev') {
    & npx.cmd tauri dev
    exit $LASTEXITCODE
}

$metadata = & cargo metadata --format-version 1 --no-deps --manifest-path $manifest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$target = ($metadata | ConvertFrom-Json).target_directory
if ($env:CARGO_BUILD_TARGET) {
    $target = Join-Path $target $env:CARGO_BUILD_TARGET
}

$buildArgs = @('tauri', 'build')
if ($Portable) { $buildArgs += '--no-bundle' }
& npx.cmd @buildArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$executable = Join-Path $target 'release\rbs-studio.exe'
$releaseDir = Join-Path $projectRoot 'release'
$portableExe = Join-Path $releaseDir 'RBS Studio.exe'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Copy-Item -LiteralPath $executable -Destination $portableExe -Force
Write-Output "Windows-EXE: $portableExe"
