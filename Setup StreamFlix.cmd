@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  call npm.cmd install
  goto :done
)

set "CODEX_PNPM=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"
if exist "%CODEX_PNPM%" (
  call "%CODEX_PNPM%" install
  goto :done
)

echo Could not find npm or the Codex bundled package manager.
echo Install Node.js 18 or newer from nodejs.org, then run this file again.
pause
exit /b 1

:done
if %ERRORLEVEL% NEQ 0 (
  echo Dependency setup failed. Check the message above.
  pause
  exit /b %ERRORLEVEL%
)

echo.
echo StreamFlix is ready. Double-click Start StreamFlix.cmd.
pause

