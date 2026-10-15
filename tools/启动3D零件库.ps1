[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $PSScriptRoot 'serve-three-prototype.js'
$url = 'http://127.0.0.1:8765/parts/'

$running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*serve-three-prototype.js*' } |
    Select-Object -First 1

if (-not $running) {
    Start-Process -FilePath 'node' -ArgumentList ('"' + $serverScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null
    $ready = $false
    foreach ($attempt in 1..20) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8765/health' -TimeoutSec 1
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch {}
        Start-Sleep -Milliseconds 150
    }
    if (-not $ready) { throw '3D零件库本地服务启动失败。请确认 Node.js 可用且 8765 端口未被占用。' }
}

Start-Process $url
