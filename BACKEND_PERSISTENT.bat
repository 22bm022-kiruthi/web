@echo off
REM ===================================================================
REM PERSISTENT Backend Server with Auto-Restart
REM This script keeps the backend running and restarts it if it crashes
REM ===================================================================

title Backend Server Monitor - Port 5003
color 0E

echo ========================================
echo   BACKEND SERVER MONITOR
echo   Auto-Restart Enabled
echo ========================================
echo.

cd /d "%~dp0backend"
set PORT=5003

:RESTART_LOOP
echo [%TIME%] Starting Backend Server on port 5003...
node server.js

REM If we reach here, the server stopped/crashed
echo.
echo ========================================
echo   SERVER STOPPED - Auto-restarting...
echo ========================================
echo.
echo Waiting 3 seconds before restart...
timeout /t 3 /nobreak >nul

goto RESTART_LOOP
