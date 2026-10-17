; The locked tauri-utils predates the uninstallerIcon configuration field.
; Use the supported NSIS hook to give the uninstaller the same product artwork.
!define MUI_UNICON "${__FILEDIR__}\icon.ico"
