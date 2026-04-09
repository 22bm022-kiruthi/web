# Simple backend server starter
# This script starts the backend Node.js server on port 5003

Write-Host "Starting Backend Server on port 5003..." -ForegroundColor Cyan

# Change to backend directory
cd "$PSScriptRoot\backend"

# Set environment variables
$env:PORT=5003
$env:NODE_ENV="development"

# Run the server
Write-Host "Executing: node server.js" -ForegroundColor Yellow
node server.js

# If node fails, show error
if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend server exited with code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "1. Check that Node.js is installed: node --version" -ForegroundColor Gray
    Write-Host "2. Check that dependencies are installed: npm install" -ForegroundColor Gray
    Write-Host "3. Check for port conflicts: netstat -ano | findstr 5003" -ForegroundColor Gray
    pause
}
