@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node 20+ em https://nodejs.org e rode de novo.
  pause & exit /b 1
)
call npm install || (echo Falha no npm install & pause & exit /b 1)
call npm run dist || (echo Falha ao gerar o instalador & pause & exit /b 1)
echo.
echo Pronto! O instalador esta na pasta dist\
start "" "%~dp0dist"
pause
