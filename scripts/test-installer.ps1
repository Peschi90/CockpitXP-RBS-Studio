param([string]$NsisDirectory = (Join-Path $env:LOCALAPPDATA 'tauri\NSIS'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$compiler = Join-Path $NsisDirectory 'Bin\makensis.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Build the desktop installer first to download NSIS.' }
$outputDirectory = Join-Path $projectRoot 'test-results\installer-requirements'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$hook = Join-Path $projectRoot 'src-tauri\installer\requirements.nsh'

# Exercise the actual NSIS guard without installing the app or touching the
# registry. Fixtures supply cached OS versions and native architecture results;
# the host case uses the real Windows detection. This is not a Windows 7 VM test.
$cases = @(
    @{ Name = 'windows7-x64'; Version = '0x06010000'; X64 = 1; Expected = 1150 },
    @{ Name = 'windows8-x64'; Version = '0x06020000'; X64 = 1; Expected = 1150 },
    @{ Name = 'windows81-x64'; Version = '0x06030000'; X64 = 1; Expected = 1150 },
    @{ Name = 'windows10-x64'; Version = '0x0A000000'; X64 = 1; Expected = 42 },
    @{ Name = 'windows11-x64'; Version = '0x0A000000'; X64 = 1; Expected = 42 },
    @{ Name = 'windows10-x86'; Version = '0x0A000000'; X64 = 0; Expected = 1633 },
    @{ Name = 'windows11-arm64'; Version = '0x0A000000'; X64 = 0; Expected = 1633 },
    @{ Name = 'host'; Version = ''; X64 = 1; Expected = 42 }
)
foreach ($case in $cases) {
    $fixture = ''
    $initialize = ''
    if ($case.Name -ne 'host') {
        $fixture = '!undef IsNativeAMD64' + "`r`n" + '!define IsNativeAMD64 "' + $case.X64 + ' = 1"'
        $initialize = 'StrCpy $__WINVERV ' + $case.Version
    }
    $source = @'
Unicode true
RequestExecutionLevel user
Name "RBS requirements test"
OutFile "@EXE@"
!include MUI2.nsh
!include x64.nsh
@FIXTURE@
!include "@HOOK@"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"
Function .onInit
  @INITIALIZE@
FunctionEnd
Section "Would install WebView2"
  SetErrorLevel 42
  Quit
SectionEnd
'@
    $executable = Join-Path $outputDirectory ($case.Name + '.exe')
    $script = Join-Path $outputDirectory ($case.Name + '.nsi')
    $source = $source.Replace('@EXE@', $executable).Replace('@HOOK@', $hook).Replace('@FIXTURE@', $fixture).Replace('@INITIALIZE@', $initialize)
    [IO.File]::WriteAllText($script, $source, [Text.UTF8Encoding]::new($false))
    & $compiler /V2 $script
    if ($LASTEXITCODE -ne 0) { throw "NSIS compilation failed: $($case.Name)" }
    $process = Start-Process -FilePath $executable -ArgumentList '/S' -PassThru -WindowStyle Hidden
    if (-not $process.WaitForExit(15000)) {
        $process.Kill()
        throw "Requirements test timed out: $($case.Name)"
    }
    if ($process.ExitCode -ne $case.Expected) {
        throw "$($case.Name): expected $($case.Expected), got $($process.ExitCode)"
    }
    Write-Output "PASS $($case.Name): exit $($process.ExitCode)"
}

# Inspect the real bundled installer: its early section and GUI callback must
# precede WebView2 and maintenance pages. PREINSTALL alone is too late.
$installer = Join-Path $projectRoot 'src-tauri\target\release\nsis\x64\installer.nsi'
$bundled = [IO.File]::ReadAllText($installer)
$hookInclude = $bundled.IndexOf('!include "' + $hook + '"')
$firstSection = [regex]::Match($bundled, '(?m)^Section ').Index
if ($hookInclude -lt 0 -or $hookInclude -gt $firstSection) { throw 'Requirements must be included before the bundled sections.' }
$expanded = & $compiler /PPO $script
if ($LASTEXITCODE -ne 0) { throw 'Could not preprocess the requirements test.' }
$expanded = $expanded -join "`n"
$guardSection = $expanded.IndexOf('Section "-RBS Studio Systemanforderungen"')
$webviewSection = $expanded.IndexOf('Section "Would install WebView2"')
if ($guardSection -lt 0 -or $webviewSection -lt $guardSection) { throw 'Requirements must execute before WebView2.' }
if ($expanded -notmatch '(?s)Function \.onGUIInit\b(?:(?!FunctionEnd).)*Call "?RbsCheckRequirements') {
    throw 'Missing early GUI requirements callback.'
}
Write-Output 'PASS bundled installer: early GUI callback and first section before WebView2'
