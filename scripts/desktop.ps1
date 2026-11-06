param([ValidateSet('dev','build','test','check')][string]$Action = 'dev')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$localCargo = Join-Path $projectRoot '.tools\cargo'
if (Test-Path -LiteralPath (Join-Path $localCargo 'bin\cargo.exe')) {
    $env:CARGO_HOME = $localCargo
    $env:RUSTUP_HOME = Join-Path $projectRoot '.tools\rustup'
    $env:PATH = "$localCargo\bin;$env:PATH"
}
if ($Action -in @('test','check')) { & cargo $Action --manifest-path src-tauri/Cargo.toml }
else { & npx.cmd tauri $Action }
exit $LASTEXITCODE
