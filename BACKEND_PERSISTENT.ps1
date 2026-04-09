# ===================================================================
# PERSISTENT Backend Server with Auto-Restart (PowerShell)
# ===================================================================

$host.UI.RawUI.WindowTitle = "Backend Server Monitor - Port 5003"
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  BACKEND SERVER MONITOR" -ForegroundColor Yellow
Write-Host "  Auto-Restart Enabled" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

$backendPath = Join-Path $PSScriptRoot "backend"
Set-Location $backendPath
$env:PORT = 5003

while ($true) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] Starting Backend Server on port 5003..." -ForegroundColor Cyan
    
    try {
        # Start the node process and wait for it
        $process = Start-Process -FilePath "node" -ArgumentList "server.js" -NoNewWindow -PassThru
        $process.WaitForExit()
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "  SERVER STOPPED - Auto-restarting..." -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "Waiting 3 seconds before restart..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
    catch {
        Write-Host "Error starting server: $($_.Exception.Message)" -ForegroundColor Red
        Start-Sleep -Seconds 5
    }
}
