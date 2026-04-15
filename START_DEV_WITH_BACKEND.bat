@echo off
REM Start persistent backend in a new window, then run the frontend dev server
pushd %~dp0

REM Start persistent backend monitor (auto-restarts) in a new PowerShell window
start "Backend (5003)" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0BACKEND_PERSISTENT.ps1"

REM Give backend a few seconds to initialize
timeout /t 3 /nobreak >nul

REM Start the Vite dev server in this window
npm run dev

popd
