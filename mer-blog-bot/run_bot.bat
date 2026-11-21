@echo off
REM Run by Windows Task Scheduler every 2 minutes
chcp 65001 > nul
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" mer_bot.py
) else (
    python mer_bot.py
)
