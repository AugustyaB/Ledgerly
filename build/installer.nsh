# ==============================================================================
# Ledgerly — Custom NSIS Multi-Purpose Setup, Repair & Safe Uninstall Suite
# ==============================================================================
# Implements:
# 1. 3-Mode Install / In-Place Repair / Upgrade detection (customInit)
# 2. Post-Install Finish Page tick-box for optional Desktop Shortcut (customFinishPage)
# 3. Complete %APPDATA%\Ledgerly wipe on uninstall with optional backup export
#    to User's Documents folder ($DOCUMENTS\Ledgerly Backups) in JSON or CSV format
# ==============================================================================

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    Function CreateDesktopShortcutOnFinish
      CreateShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
      WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
      System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !define MUI_FINISHPAGE_SHOWREADME ""
    !define MUI_FINISHPAGE_SHOWREADME_TEXT "Create Desktop Shortcut"
    !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "CreateDesktopShortcutOnFinish"
  !endif
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customInit
  ${IfNot} ${Silent}
    # Direct detection: check registry and standard install path since $hasPerUserInstallation
    # is only initialized by electron-builder AFTER customInit finishes.
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "InstallLocation"
    ${If} $0 == ""
      ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "InstallLocation"
    ${EndIf}
    ${If} $0 == ""
      ${If} ${FileExists} "$LOCALAPPDATA\Programs\Ledgerly\Ledgerly.exe"
        StrCpy $0 "$LOCALAPPDATA\Programs\Ledgerly"
      ${ElseIf} ${FileExists} "$PROGRAMFILES\Ledgerly\Ledgerly.exe"
        StrCpy $0 "$PROGRAMFILES\Ledgerly"
      ${EndIf}
    ${EndIf}

    ${If} $0 != ""
      MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
        "An existing Ledgerly installation was detected on this computer at:$\r$\n$0$\r$\n$\r$\nClick OK to perform an In-Place Repair / Upgrade. Application binaries will be refreshed while your offline financial data in %APPDATA%\Ledgerly remains 100% intact." \
        IDOK +2
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    SetShellVarContext current

    ${IfNot} ${Silent}
      IfFileExists "$APPDATA\Ledgerly\expenses_db.json" 0 PerformCompleteWipe
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 \
        "Ledgerly will now perform a complete wipe of the application and its local data folder ($APPDATA\Ledgerly).$\r$\n$\r$\nBefore wiping, would you like to save a backup of your financial data to your Documents folder ($DOCUMENTS\Ledgerly Backups)?" \
        IDYES ChooseBackupFormat IDNO PerformCompleteWipe

      ChooseBackupFormat:
        CreateDirectory "$DOCUMENTS\Ledgerly Backups"
        MessageBox MB_YESNO|MB_ICONINFORMATION|MB_DEFBUTTON1 \
          "Select your preferred backup format in $DOCUMENTS\Ledgerly Backups:$\r$\n$\r$\n• Click YES for Full JSON Backup + Receipts (re-importable into Ledgerly)$\r$\n• Click NO for Universal CSV Spreadsheet (opens in Excel / Google Sheets)" \
          IDYES ExportJsonBackup IDNO ExportCsvBackup

      ExportJsonBackup:
        CreateDirectory "$DOCUMENTS\Ledgerly Backups\Ledgerly_Full_Backup"
        CopyFiles /SILENT "$APPDATA\Ledgerly\*.json" "$DOCUMENTS\Ledgerly Backups\Ledgerly_Full_Backup"
        IfFileExists "$APPDATA\Ledgerly\receipts\*.*" 0 +3
          CreateDirectory "$DOCUMENTS\Ledgerly Backups\Ledgerly_Full_Backup\receipts"
          CopyFiles /SILENT "$APPDATA\Ledgerly\receipts\*.*" "$DOCUMENTS\Ledgerly Backups\Ledgerly_Full_Backup\receipts"
        MessageBox MB_OK|MB_ICONINFORMATION \
          "Full JSON backup and receipts have been saved to:$\r$\n$DOCUMENTS\Ledgerly Backups\Ledgerly_Full_Backup"
        Goto PerformCompleteWipe

      ExportCsvBackup:
        nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$dbPath = Join-Path $$env:APPDATA \"Ledgerly\expenses_db.json\"; $$outDir = Join-Path ([Environment]::GetFolderPath(\"MyDocuments\")) \"Ledgerly Backups\"; New-Item -ItemType Directory -Force -Path $$outDir | Out-Null; $$csvPath = Join-Path $$outDir \"Ledgerly_Expenses_Backup.csv\"; if (Test-Path $$dbPath) { $$raw = Get-Content $$dbPath -Raw | ConvertFrom-Json; $$rows = @(); if ($$raw.expenses) { $$rows += $$raw.expenses }; if ($$raw.profilesData) { foreach ($$p in $$raw.profilesData.PSObject.Properties) { if ($$p.Value.expenses) { $$rows += $$p.Value.expenses } } }; $$rows | Select-Object id, date, title, amount, category, paymentMethod, profileId, description | Export-Csv -Path $$csvPath -NoTypeInformation -Encoding UTF8 }"'
        MessageBox MB_OK|MB_ICONINFORMATION \
          "Universal CSV spreadsheet has been exported to:$\r$\n$DOCUMENTS\Ledgerly Backups\Ledgerly_Expenses_Backup.csv"
        Goto PerformCompleteWipe
    ${EndIf}

    PerformCompleteWipe:
      RMDir /r "$APPDATA\Ledgerly"
      RMDir /r "$APPDATA\ledgerly"
      RMDir /r "$LOCALAPPDATA\ledgerly-updater"
  ${EndIf}
!macroend
