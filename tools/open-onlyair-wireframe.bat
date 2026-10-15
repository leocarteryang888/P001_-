@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-onlyair-wireframe.ps1" %*
if errorlevel 1 (
    echo Failed to open the ONLYAIR wireframe.
    pause
)
endlocal
