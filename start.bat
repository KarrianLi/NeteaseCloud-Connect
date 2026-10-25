@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "QUIET=0"
if /i "%~1"=="/quiet" set "QUIET=1"

set "NODE=%~dp0tools\node\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" -v >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please run install.bat first.
  if "%QUIET%"=="0" pause
  exit /b 1
)

set "CLIENT="
set "TMPF=%TEMP%\netease_remote_client.txt"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0find-client.ps1" > "%TMPF%" 2>nul
if exist "%TMPF%" set /p CLIENT=<"%TMPF%"
del "%TMPF%" >nul 2>&1
if not defined CLIENT (
  echo [ERROR] Netease Cloud Music not found.
  echo         Install it, or set CLOUDMUSIC_EXE to cloudmusic.exe
  if "%QUIET%"=="0" pause
  exit /b 1
)
echo [0/2] Client: %CLIENT%

netstat -ano | findstr /c:":9222" | findstr /c:"LISTENING" >nul
if not errorlevel 1 (
  echo [1/2] Netease Cloud Music is running with debug port.
  goto run
)

tasklist /fi "imagename eq cloudmusic.exe" 2>nul | findstr /i cloudmusic >nul
if not errorlevel 1 (
  echo [WARN] Netease Cloud Music is running without debug port.
  if "%QUIET%"=="1" (
    echo        Auto-start mode will not restart it. Quit Netease and run start.bat manually.
    goto run
  )
  echo        Restarting it in 3 seconds to enable debug port...
  timeout /t 3 /nobreak >nul
  taskkill /f /im cloudmusic.exe >nul 2>&1
  timeout /t 2 /nobreak >nul
)

echo [1/2] Starting Netease Cloud Music...
start "" "%CLIENT%" --remote-debugging-port=9222
timeout /t 8 /nobreak >nul

:run
echo [2/2] Starting remote control service...
echo.
if "%QUIET%"=="0" (
  echo   Phone and PC must be on the same WiFi. Open the URL printed below.
  echo   Keep this window open. Closing it stops the service.
  echo.
)
if not exist "%~dp0server\data" mkdir "%~dp0server\data"
cd /d "%~dp0server"
if "%QUIET%"=="1" (
  "%NODE%" bridge.js >> "%~dp0server\data\server.log" 2>&1
) else (
  "%NODE%" bridge.js
  pause
)
