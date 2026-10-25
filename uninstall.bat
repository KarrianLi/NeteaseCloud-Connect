@echo off
chcp 65001 >nul
call "%~dp0stop.bat"
set "S1=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\NeteaseRemote.lnk"
if exist "%S1%" del "%S1%"
echo Auto start removed and service stopped.
pause
