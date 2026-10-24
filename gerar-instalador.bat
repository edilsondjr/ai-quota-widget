@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install Node 20+ from https://nodejs.org and run this again.
  pause & exit /b 1
)
call npm install || (echo npm install failed & pause & exit /b 1)
call npm run dist || (echo Building the installer failed & pause & exit /b 1)
echo.
echo Done! The installer is in the dist\ folder.
start "" "%~dp0dist"
pause
