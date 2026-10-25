@echo off
chcp 65001 >nul
echo Stopping remote control service...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /c:":3040" ^| findstr /c:"LISTENING"') do taskkill /f /pid %%a >nul 2>&1
echo Stopped. Netease Cloud Music keeps running.
timeout /t 2 /nobreak >nul
