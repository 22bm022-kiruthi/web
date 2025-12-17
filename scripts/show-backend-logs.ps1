<#
show-backend-logs.ps1

Prints backend stdout/stderr logs using correct paths regardless of current working directory.

Usage:
  .\scripts\show-backend-logs.ps1 [-Tail N] [-Follow]

Examples:
  .\scripts\show-backend-logs.ps1 -Tail 200
  .\scripts\show-backend-logs.ps1 -Tail 100 -Follow
#>

[CmdletBinding()]
param(
  [int]$Tail = 200,
  [switch]$Follow
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path "$scriptDir\.."
$backendDir = Join-Path $repoRoot 'backend'
$outLog = Join-Path $backendDir 'server.out.log'
$errLog = Join-Path $backendDir 'server.err.log'

Write-Host "Repo root: $repoRoot"
Write-Host "Backend logs: $outLog`n             $errLog"

if (-not (Test-Path $outLog) -and -not (Test-Path $errLog)) {
  Write-Warning "No backend log files found yet. Start the backend using .\scripts\start-backend.ps1 or run the server in the backend folder."
  exit 0
}

if ($Follow) {
  if (Test-Path $outLog) { Write-Host "--- STDOUT (tail $Tail) ---"; Get-Content $outLog -Tail $Tail -Wait }
  if (Test-Path $errLog) { Write-Host "--- STDERR (tail $Tail) ---"; Get-Content $errLog -Tail $Tail -Wait }
} else {
  if (Test-Path $outLog) { Write-Host "--- STDOUT (tail $Tail) ---"; Get-Content $outLog -Tail $Tail }
  if (Test-Path $errLog) { Write-Host "--- STDERR (tail $Tail) ---"; Get-Content $errLog -Tail $Tail }
}
