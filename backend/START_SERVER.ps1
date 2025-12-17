# ===================================================================
# Backend Server Startup Script (PowerShell)
# This keeps the server running and auto-restarts on crash
# ===================================================================

$Host.UI.RawUI.WindowTitle = "Backend Server - Port 5003"
$Host.UI.RawUI.BackgroundColor = "Black"
$Host.UI.RawUI.ForegroundColor = "Green"
Clear-Host

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Backend Server - AUTO RESTART MODE" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server: http://127.0.0.1:5003" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: Keep this window OPEN!" -ForegroundColor Red
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Change to backend directory
Set-Location $PSScriptRoot

# Auto-restart loop
$restartCount = 0
while ($true) {
    try {
        if ($restartCount -gt 0) {
            Write-Host ""
            Write-Host ">>> Restarting server (attempt $restartCount)..." -ForegroundColor Yellow
            Start-Sleep -Seconds 2
        }
        
        Write-Host ">>> Starting node server.js..." -ForegroundColor Green
        Write-Host ""
        
        # Ensure PORT is set explicitly for consistency
        $env:PORT = 5003
        # Run the server
        node server.js
        
        # If we get here, server exited normally
        Write-Host ""
        Write-Host ">>> Server stopped normally" -ForegroundColor Yellow
        
    } catch {
        Write-Host ""
        Write-Host ">>> Server crashed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    $restartCount++
    
    # Ask user if they want to restart
    Write-Host ""
    Write-Host "Press Enter to restart, or Ctrl+C to exit..." -ForegroundColor Cyan
    Read-Host
}
