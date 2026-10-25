@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "NODE_DIR=%~dp0tools\node"
set "NODE=%NODE_DIR%\node.exe"

if exist "%NODE%" goto havenode
echo [1/4] Downloading portable Node.js ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Force -Path '%~dp0tools' | Out-Null; Invoke-WebRequest -Uri 'https://npmmirror.com/mirrors/node/v22.23.4/node-v22.23.4-win-x64.zip' -OutFile '%~dp0tools\node.zip'; Expand-Archive -Path '%~dp0tools\node.zip' -DestinationPath '%~dp0tools' -Force; Rename-Item '%~dp0tools\node-v22.23.4-win-x64' 'node'; Remove-Item '%~dp0tools\node.zip'"
if not exist "%NODE%" (
  echo [ERROR] Failed to download Node.js. Install Node.js 18+ manually and run again.
  pause
  exit /b 1
)

:havenode
echo [2/4] Installing dependencies ...
pushd "%~dp0server"
"%NODE%" "%NODE_DIR%\node_modules\npm\bin\npm-cli.js" install --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com
if errorlevel 1 (
  echo [ERROR] npm install failed. Check your network and try again.
  popd
  pause
  exit /b 1
)
popd

echo [3/4] Enabling auto start ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"

echo [4/4] Done.
echo   Double-click start.bat to launch. The service also starts on boot.
pause
