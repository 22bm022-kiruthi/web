@echo off
REM ===================================================================
REM Backend Server Startup Script
REM This keeps the server running in a persistent window
REM ===================================================================

title Backend Server - Port 5003
color 0A

echo.
echo ========================================
echo   Starting Backend Server
echo ========================================
echo.
echo Server will run on: http://127.0.0.1:5003
echo.
echo IMPORTANT: Keep this window OPEN!
echo Closing this window will stop the server.
echo.
echo ========================================
echo.

cd /d "%~dp0"
set PORT=5003
node server.js

echo.
echo ========================================
echo   Server has stopped!
echo ========================================
echo.
pause
