<#
Start-backend.ps1

Starts the backend server (node server.js) as a background job and writes logs to
`backend/server.out.log` and `backend/server.err.log` so you can inspect output.

Usage:
  .\scripts\start-backend.ps1

Notes:
- Requires PowerShell 5.1+. Runs `npm install` if `node_modules` is missing.
- Uses Start-Job to run the server in the background. Use `Get-Job` / `Receive-Job` to inspect.
#>

$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
$root = Resolve-Path "$here\.."
$backend = Join-Path $root 'backend'

Write-Host "Starting backend from: $backend"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found in PATH. Please install Node.js and try again."; exit 1
}

# Ensure dependencies
if (-not (Test-Path (Join-Path $backend 'node_modules'))) {
    Write-Host "node_modules not found — running npm install..."
    Push-Location $backend
    npm install
    Pop-Location
}

$outLog = Join-Path $backend 'server.out.log'
$errLog = Join-Path $backend 'server.err.log'

# Stop existing job if present
Get-Job -Name DeepspectrumBackend -ErrorAction SilentlyContinue | Stop-Job -Force -ErrorAction SilentlyContinue | Out-Null
Get-Job -Name DeepspectrumBackend -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "Starting backend as background job (logs -> $outLog, $errLog)"

Start-Job -Name DeepspectrumBackend -ScriptBlock {
    param($backendPath, $out, $err)
    Set-Location $backendPath
    # Run node server and redirect output
    # Use PowerShell redirection to capture stdout/stderr
    & node server.js *> $out 2*> $err
} -ArgumentList $backend, $outLog, $errLog | Out-Null

Start-Sleep -Seconds 1
Get-Job -Name DeepspectrumBackend | Format-Table Id, Name, State, HasMoreData -AutoSize

Write-Host "To view logs:"
Write-Host "  Get-Content $outLog -Tail 50 -Wait"
Write-Host "  Get-Content $errLog -Tail 50 -Wait"
