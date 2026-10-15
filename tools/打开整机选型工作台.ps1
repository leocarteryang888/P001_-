param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$server = Join-Path $PSScriptRoot 'serve-three-prototype.js'
$runtimeDirectory = Join-Path $projectRoot 'outputs/03-整机选型工作台'
$htmlFile = Join-Path $runtimeDirectory '工业工作台_ThreeJS原型.html'
$health = 'http://127.0.0.1:8765/health'
$url = 'http://127.0.0.1:8765/%E5%B7%A5%E4%B8%9A%E5%B7%A5%E4%BD%9C%E5%8F%B0_ThreeJS%E5%8E%9F%E5%9E%8B.html'

function Test-WorkbenchReady {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 1
        return $response.StatusCode -eq 200 -and $response.Content.Trim() -eq 'P001 Three.js prototype'
    } catch { return $false }
}

try {
    if (-not (Test-Path -LiteralPath $htmlFile)) { throw "找不到最终版 HTML：$htmlFile" }
    if (-not (Test-WorkbenchReady)) {
        $node = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $node) { throw '未找到 Node.js。请安装 Node.js 后再打开工作台。' }
        $stdoutLog = Join-Path $runtimeDirectory 'workbench-server.stdout.log'
        $stderrLog = Join-Path $runtimeDirectory 'workbench-server.stderr.log'
        $process = Start-Process -FilePath $node.Source -ArgumentList ('"' + $server + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
        $timer = [Diagnostics.Stopwatch]::StartNew()
        while (-not (Test-WorkbenchReady)) {
            $process.Refresh()
            if ($process.HasExited) {
                $details = (Get-Content -LiteralPath $stderrLog -Tail 8 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
                if ($details -match 'EADDRINUSE') {
                    # Another instance already owns 8765. The user-facing page is
                    # still the same local entry; do not report a false launch failure.
                    $ready = $true
                    break
                }
                throw "预览服务启动失败。请检查 8765 端口是否被占用。日志：$stderrLog`n$details"
            }
            if ($timer.Elapsed.TotalSeconds -ge 15) { throw "预览服务未在 15 秒内就绪。日志：$stderrLog" }
            Start-Sleep -Milliseconds 200
        }
    }
    $version = (Get-Item -LiteralPath $htmlFile).LastWriteTimeUtc.Ticks
    $url += '?ui=' + $version
    if (-not $NoBrowser) { Start-Process $url | Out-Null }
    Write-Output "工作台已就绪：$url"
} catch {
    Write-Host ('打开工作台失败：' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
