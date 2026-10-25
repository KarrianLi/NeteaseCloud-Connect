@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "QUIET=0"
if /i "%~1"=="/quiet" set "QUIET=1"
set "PORT=3040"
set "CDATA=%~dp0server\data"
set "SLOG=%CDATA%\server.log"
set "WSCRIPT=%SystemRoot%\System32\wscript.exe"
if not exist "%WSCRIPT%" set "WSCRIPT=wscript.exe"

set "NODE=%~dp0tools\node\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" -v >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please run install.bat first.
  if "%QUIET%"=="0" pause
  exit /b 1
)

set "CLIENT="
if not exist "%CDATA%" mkdir "%CDATA%" >nul 2>&1
set "TMPF=%CDATA%\nc_client.txt"
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
if not exist "%CDATA%" mkdir "%CDATA%" >nul 2>&1
if "%QUIET%"=="1" goto run_quiet

echo [2/2] Starting remote control service...
echo.
echo   Phone and PC must be on the same WiFi.
echo   This window hides itself as soon as the service is ready.
echo.

call :port_up
if not errorlevel 1 (
  echo [OK] Remote control service is already running.
  call :show_url
  echo.
  echo   Double-click stop.bat to stop it.
  echo   This window will hide in 10 seconds.
  echo.
  timeout /t 10 /nobreak >nul
  exit /b 0
)

echo   Launching it in the background ^(same hidden entry as auto start^)...
start "" "%WSCRIPT%" "%~dp0start-hidden.vbs"
call :wait_port 60
if errorlevel 1 (
  echo.
  echo [ERROR] Remote control service did not start in 60 seconds.
  echo         Check the log: %SLOG%
  echo.
  pause
  exit /b 1
)

echo [OK] Remote control service is running in the background.
call :show_url
echo.
echo   Double-click stop.bat to stop it.
echo   Run start.bat again at any time to see this address.
echo   This window will hide in 10 seconds.
echo.
timeout /t 10 /nobreak >nul
exit /b 0

:run_quiet
cd /d "%~dp0server"
"%NODE%" bridge.js >> "%SLOG%" 2>&1
exit /b 0

rem ---------------------------------------------------------------
rem helpers
rem ---------------------------------------------------------------
:port_up
netstat -ano | findstr /c:":%PORT%" | findstr /c:"LISTENING" >nul
if errorlevel 1 exit /b 1
exit /b 0

:wait_port
set /a __t=0
:wait_port_loop
call :port_up
if not errorlevel 1 exit /b 0
set /a __t+=1
if !__t! geq %~1 exit /b 1
timeout /t 1 /nobreak >nul
goto :wait_port_loop

:show_url
set "URL="
set "URLF=%CDATA%\nc_url.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u=''; $p='%SLOG%'; if (Test-Path -LiteralPath $p) { $m=@(Select-String -LiteralPath $p -Pattern 'http://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:%PORT%/' -Encoding UTF8 -ErrorAction SilentlyContinue); if ($m.Count -gt 0) { $u=[regex]::Match($m[$m.Count-1].Line,'http://[0-9.]+:%PORT%/').Value } }; if ($u) { $u }" > "%URLF%" 2>nul
if exist "%URLF%" set /p URL=<"%URLF%"
del "%URLF%" >nul 2>&1
if not defined URL call :lan_url
if not defined URL set "URL=http://127.0.0.1:%PORT%/"
echo.
echo   Open on your phone:  %URL%
echo   On this PC:          http://127.0.0.1:%PORT%/
exit /b 0

:lan_url
set "URLF=%CDATA%\nc_url.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ip=@(Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' })[0].IPv4Address.IPAddress; if (-not $ip) { $a=@([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | ForEach-Object { $_.GetIPProperties().UnicastAddresses } | ForEach-Object { $_.Address } | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and -not [Net.IPAddress]::IsLoopback($_) -and $_.ToString() -notlike '169.254.*' }); if ($a.Count -gt 0) { $ip=$a[0].ToString() } }; if ($ip) { $ip }" > "%URLF%" 2>nul
set "LANIP="
if exist "%URLF%" set /p LANIP=<"%URLF%"
del "%URLF%" >nul 2>&1
if defined LANIP set "URL=http://%LANIP%:%PORT%/"
exit /b 0
