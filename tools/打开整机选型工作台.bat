@echo off
chcp 65001 >nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-workbench.ps1"
if errorlevel 1 (
  echo.
  echo 启动失败。请记录上方提示，完整日志位于 outputs\03-整机选型工作台\workbench-launcher.log
  pause
  exit /b 1
)
echo.
echo 启动脚本已完成。请查看浏览器是否打开；日志位于 outputs\03-整机选型工作台\workbench-launcher.log
pause
exit /b 0
