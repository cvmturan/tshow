@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE="
where node.exe >nul 2>nul
if %ERRORLEVEL% EQU 0 set "NODE_EXE=node.exe"

if not defined NODE_EXE (
  set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if exist "%CODEX_NODE%" set "NODE_EXE=%CODEX_NODE%"
)

if not defined NODE_EXE (
  echo StreamFlix needs Node.js 18 or newer.
  echo Install Node.js, then run Setup StreamFlix.cmd.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo StreamFlix dependencies are missing.
  echo Run Setup StreamFlix.cmd first.
  pause
  exit /b 1
)

if not defined HOST set "HOST=0.0.0.0"
start "" "http://127.0.0.1:3000"
"%NODE_EXE%" server.js
echo.
echo StreamFlix stopped.
pause
