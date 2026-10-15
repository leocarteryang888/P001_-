@echo off
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0打开整机选型工作台.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
