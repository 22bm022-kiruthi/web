# PowerShell helper to start Node backend and Python KMeans service
# Usage: Open PowerShell in repo root and run: .\scripts\start-servers.ps1

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$backendDir = Join-Path $repoRoot 'backend'
$pythonDir = Join-Path $backendDir 'python'

function Start-NodeBackend {
    Write-Host "Starting Node backend in $backendDir"
    Push-Location $backendDir
    # Install deps if node_modules missing
    if (-Not (Test-Path './node_modules')) {
        npm install
    }
    $nodeLog = Join-Path $backendDir 'server.log'
    $nodeErr = Join-Path $backendDir 'server.err'

    # Start node in background and redirect output
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = 'npm'
    $startInfo.Arguments = 'run start'
    $startInfo.WorkingDirectory = $backendDir
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $startInfo
    $proc.Start() | Out-Null

    # Async logging
    Start-Job -ScriptBlock {
        Param($p, $outFile, $errFile)
        $o = $p.StandardOutput
        $e = $p.StandardError
        while (-not $p.HasExited) {
            while (-not $o.EndOfStream) { $line = $o.ReadLine(); Add-Content -Path $outFile -Value $line }
            while (-not $e.EndOfStream) { $line = $e.ReadLine(); Add-Content -Path $errFile -Value $line }
            Start-Sleep -Milliseconds 200
        }
        # drain remaining
        while (-not $o.EndOfStream) { $line = $o.ReadLine(); Add-Content -Path $outFile -Value $line }
        while (-not $e.EndOfStream) { $line = $e.ReadLine(); Add-Content -Path $errFile -Value $line }
    } -ArgumentList $proc, $nodeLog, $nodeErr | Out-Null

    Pop-Location
    return $true
}

function Start-PythonKMeans {
    Write-Host "Starting Python KMeans service in $pythonDir"
    Push-Location $pythonDir
    if (-Not (Test-Path '.\.venv')) {
        python -m venv .venv
    }
    $activate = Join-Path $pythonDir '.venv\Scripts\Activate.ps1'
    . $activate
    if (-Not (Test-Path '.venv\Lib\site-packages\Flask')) {
        Write-Host 'Installing Python requirements (this may take a minute)...'
        pip install -r requirements.txt
    }

    $pyLog = Join-Path $pythonDir 'kmeans.log'
    $pyErr = Join-Path $pythonDir 'kmeans.err'

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = Join-Path $pythonDir '.venv\Scripts\python.exe'
    $startInfo.Arguments = 'kmeans_service.py'
    $startInfo.WorkingDirectory = $pythonDir
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $startInfo
    $proc.Start() | Out-Null

    Start-Job -ScriptBlock {
        Param($p, $outFile, $errFile)
        $o = $p.StandardOutput
        $e = $p.StandardError
        while (-not $p.HasExited) {
            while (-not $o.EndOfStream) { $line = $o.ReadLine(); Add-Content -Path $outFile -Value $line }
            while (-not $e.EndOfStream) { $line = $e.ReadLine(); Add-Content -Path $errFile -Value $line }
            Start-Sleep -Milliseconds 200
        }
        while (-not $o.EndOfStream) { $line = $o.ReadLine(); Add-Content -Path $outFile -Value $line }
        while (-not $e.EndOfStream) { $line = $e.ReadLine(); Add-Content -Path $errFile -Value $line }
    } -ArgumentList $proc, $pyLog, $pyErr | Out-Null

    Pop-Location
    return $true
}

function Wait-For-Http {
    Param(
        [string]$Url,
        [int]$Retries = 20,
        [int]$DelaySec = 1
    )
    for ($i=0; $i -lt $Retries; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { Write-Host "$Url is up"; return $true }
        } catch {
            # ignore
        }
        Start-Sleep -Seconds $DelaySec
    }
    Write-Host "Timed out waiting for $Url"
    return $false
}

# Start services
Start-NodeBackend
Start-PythonKMeans

# Wait for health endpoints
$okNode = Wait-For-Http -Url 'http://127.0.0.1:5003/api/health' -Retries 30 -DelaySec 1
$okPy = Wait-For-Http -Url 'http://127.0.0.1:6010/api/health' -Retries 30 -DelaySec 1

if ($okNode -and $okPy) {
    Write-Host "Both Node backend and Python KMeans are running. You can now use the UI without repeated ECONNREFUSED errors."
    Write-Host "Node health: http://127.0.0.1:5003/api/health"
    Write-Host "KMeans health: http://127.0.0.1:6010/api/health"
    exit 0
} else {
    Write-Host "One or more services did not start. Check server logs:"
    Write-Host "  Node log: $repoRoot\backend\server.log"
    Write-Host "  Node err: $repoRoot\backend\server.err"
    Write-Host "  Python log: $repoRoot\backend\python\kmeans.log"
    Write-Host "  Python err: $repoRoot\backend\python\kmeans.err"
    exit 1
}
