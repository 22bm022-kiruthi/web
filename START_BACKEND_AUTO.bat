@echo off
REM ===================================================================
REM Auto-Start Backend Server with Health Check
REM This script ensures the backend is always running
REM ===================================================================

title Backend Auto-Starter
color 0B

:START
echo ========================================
echo   Checking Backend Server Status
echo ========================================
echo.

REM Check if port 5003 is listening
netstat -ano | findstr "5003" | findstr "LISTENING" >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo ✓ Backend server is already running on port 5003
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 0
)

echo ✗ Backend server is NOT running
echo.
echo [1/2] Starting Backend Server...
start "Backend Server - Port 5003" cmd /k "cd /d "%~dp0backend" && set PORT=5003 && node server.js"

echo [2/2] Waiting for server to start...
timeout /t 5 /nobreak >nul

REM Verify server started
netstat -ano | findstr "5003" | findstr "LISTENING" >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   ✓ Backend Server Started Successfully!
    echo ========================================
    echo.
    echo Server URL: http://127.0.0.1:5003
    echo Health Check: http://127.0.0.1:5003/api/health
    echo.
    echo The server is running in a separate window.
    echo Keep that window open!
    echo.
) else (
    echo.
    echo ========================================
    echo   ✗ Failed to start backend server
    echo ========================================
    echo.
    echo Please check the backend logs for errors.
    echo.
)

echo Press any key to exit...
pause >nul
