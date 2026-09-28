@echo off
setlocal
cd /d "%~dp0prototype"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then run this file again.
  pause
  exit /b 1
)

netstat -ano | find ":4173" | find "LISTENING" >nul
if not errorlevel 1 (
  start "" "http://127.0.0.1:4173"
  echo Server is already running. Opened the site.
  pause
  exit /b 0
)

echo Starting http://127.0.0.1:4173
echo Close this window to stop the server.
start "" /min cmd /c "ping -n 2 127.0.0.1 >nul & start http://127.0.0.1:4173"
node server.mjs
if errorlevel 1 (
  echo.
  echo Server stopped or could not start.
  echo If it is already running, open http://127.0.0.1:4173
  start "" "http://127.0.0.1:4173"
  pause
)