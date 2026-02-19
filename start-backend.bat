@echo off
echo.
echo ========================================
echo KSeF Desktop - Backend Startup Script
echo ========================================
echo.
echo Uruchamianie backend serwera...
echo Backend bedzie dostepny na: http://localhost:8765
echo.

cd /d "%~dp0src\backend"

REM Check if node_modules exist
if not exist "node_modules" (
  echo.
  echo Instalowanie zależności backend...
  call npm install
)

REM Start backend
echo.
echo Uruchamianie backend serwera...
call npm start

pause
