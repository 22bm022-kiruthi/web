# ===================================================================
# PowerShell Script to Check and Auto-Start Backend Server
# ===================================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Backend Server Health Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if port 5003 is listening
$listening = Get-NetTCPConnection -LocalPort 5003 -State Listen -ErrorAction SilentlyContinue

if ($listening) {
    Write-Host "[OK] Backend server is already running on port 5003" -ForegroundColor Green
    Write-Host ""

    # Test health endpoint
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:5003/api/health" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "[OK] Health check passed" -ForegroundColor Green
            Write-Host "  Server URL: http://127.0.0.1:5003" -ForegroundColor Gray
        }
    } catch {
        Write-Host "⚠ Server is running but health check failed" -ForegroundColor Yellow
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
    }
} else {
    Write-Host "[ERROR] Backend server is NOT running" -ForegroundColor Red
    Write-Host ""
    Write-Host "Starting backend server..." -ForegroundColor Yellow

    # Get backend path
    $backendPath = Join-Path $PSScriptRoot 'backend'

    # Start the backend server in a new PowerShell window
    # Use a safe command string to avoid nested quote issues
    $startCmd = "Set-Location -LiteralPath '$backendPath'; `$env:PORT=5003; node server.js"
    Start-Process -FilePath powershell -ArgumentList '-NoExit', '-Command', $startCmd -WindowStyle Normal

    Write-Host "Waiting for server to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5

    # Verify it started
    $listening = Get-NetTCPConnection -LocalPort 5003 -State Listen -ErrorAction SilentlyContinue

    if ($listening) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  [OK] Backend Server Started Successfully!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Server URL: http://127.0.0.1:5003" -ForegroundColor Gray
        Write-Host "Health Check: http://127.0.0.1:5003/api/health" -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "  [ERROR] Failed to start backend server" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please check the backend logs for errors." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
