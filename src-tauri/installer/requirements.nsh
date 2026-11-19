!include WinVer.nsh
!include x64.nsh

; Tauri includes this file before its pages and sections. PREINSTALL would
; run too late: Tauri's WebView2 section has already executed by then.
; GUIINIT also stops passive updates before the reinstall page can uninstall
; an existing copy. The first hidden section covers silent (/S) installs.
!define MUI_CUSTOMFUNCTION_GUIINIT RbsCheckRequirements

Function RbsCheckRequirements
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "RBS Studio benötigt Windows 10 oder Windows 11 in 64 Bit.$\r$\n$\r$\nWindows 7, Windows 8/8.1 und ältere Windows-Versionen werden nicht unterstützt.$\r$\n$\r$\nDie Installation wird beendet. WebView2 und RBS Studio werden nicht installiert." /SD IDOK
    SetErrorLevel 1150 ; ERROR_OLD_WIN_VERSION
    Quit
  ${EndIf}

  ${IfNot} ${IsNativeAMD64}
    MessageBox MB_OK|MB_ICONSTOP "Dieser Installer benötigt Windows 10 oder Windows 11 in 64 Bit auf einem Intel- oder AMD-PC (x64).$\r$\n$\r$\n32-Bit-Windows und Windows auf ARM werden von diesem Installer nicht unterstützt.$\r$\n$\r$\nDie Installation wird beendet. WebView2 und RBS Studio werden nicht installiert." /SD IDOK
    SetErrorLevel 1633 ; ERROR_INSTALL_PLATFORM_UNSUPPORTED
    Quit
  ${EndIf}
FunctionEnd

Section "-RBS Studio Systemanforderungen"
  SectionIn RO
  Call RbsCheckRequirements
SectionEnd
