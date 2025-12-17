@echo off
title PCA Service - Port 6005
color 0A

echo.
echo ========================================
echo   Starting PCA Service (Port 6005)
echo ========================================
echo.
echo Using Virtual Environment Python with scikit-learn
echo.
echo IMPORTANT: Keep this window OPEN!
echo Closing this window will stop the service.
echo.
echo ========================================
echo.

cd /d "%~dp0"
.venv\Scripts\python.exe pca_service_new.py

echo.
echo ========================================
echo   PCA Service has stopped!
echo ========================================
echo.
pause
