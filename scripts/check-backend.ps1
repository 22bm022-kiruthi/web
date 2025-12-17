<#
check-backend.ps1

Simple health check for the backend server.

Usage:
  .\scripts\check-backend.ps1

Returns HTTP status and JSON body from /api/health
#>

$url = 'http://127.0.0.1:5003/api/health'
try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
    Write-Host "Status: $($resp.StatusCode)"
    $content = $resp.Content
    Write-Host "Body: $content"
} catch {
    Write-Error "Failed to contact backend at $url`n$($_.Exception.Message)"
}
