@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title P001 盘管选型热更新
python "tools\盘管选型开发服务器.py" --open
if errorlevel 1 (
  echo.
  echo 启动失败，请确认已安装 Python，或检查 8768 端口是否被占用。
  pause
)
