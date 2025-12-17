@echo off
echo ========================================
echo   STARTING ALL SERVICES
echo ========================================
echo.

REM Start Backend Server
echo [1/3] Starting Backend Server (Port 5003)...
start "Backend Server - Port 5003" cmd /k "cd /d "%~dp0backend" && set PORT=5003 && node server.js"
timeout /t 3 /nobreak >nul

REM Start PCA Service  
echo [2/3] Starting PCA Service (Port 6005)...
start "PCA Service - Port 6005" cmd /k "cd /d "%~dp0backend\python" && .\.venv\Scripts\python.exe pca_service_new.py"
timeout /t 3 /nobreak >nul

REM Start Frontend
echo [3/3] Starting Frontend (Port 5173)...
start "Frontend - Port 5173" cmd /k "cd /d "%~dp0" && npm run dev"
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   ✓ ALL SERVICES STARTED SUCCESSFULLY!
echo ========================================
echo.
echo Check the 3 new windows that opened:
echo   [1] Backend Server - Port 5003
echo   [2] PCA Service - Port 6005  
echo   [3] Frontend - Port 5173
echo.
echo Your application: http://localhost:5173/
echo.
echo IMPORTANT: Keep all 3 windows open while using the app!
echo Close those windows to stop the services.
echo.
echo Press any key to close this window...
pause >nul
