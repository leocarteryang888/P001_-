param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$server = Join-Path $PSScriptRoot 'serve-three-prototype.js'
$runtimeDirectory = Join-Path $projectRoot 'outputs/03-整机选型工作台'
$launcherLog = Join-Path $runtimeDirectory 'workbench-launcher.log'
$htmlFile = Join-Path $projectRoot 'src/03-整机选型工作台/index.html'
$health = 'http://127.0.0.1:8765/health'
$url = 'http://127.0.0.1:8765/%E5%B7%A5%E4%B8%9A%E5%B7%A5%E4%BD%9C%E5%8F%B0_ThreeJS%E5%8E%9F%E5%9E%8B.html'

function Write-LaunchLog([string]$message) {
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
    try { Add-Content -LiteralPath $launcherLog -Value $line -Encoding UTF8 } catch { Write-Host "启动日志写入失败：$($_.Exception.Message)" -ForegroundColor Yellow }
}

function Test-WorkbenchReady {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 1
        return $response.StatusCode -eq 200 -and $response.Content.Trim() -eq 'P001 Three.js prototype'
    } catch { return $false }
}

function Test-WorkbenchPage {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
        return $response.StatusCode -eq 200 -and
            $response.Content -match '(?is)<!doctype\s+html|<html\b' -and
            $response.Content -match '(?is)<title>\s*AHU\s+工业工作台\s*·\s*最终版本\s*</title>'
    } catch { return $false }
}

function Open-WorkbenchBrowser([string]$targetUrl) {
    $shellCommand = 'start "" "{0}"' -f $targetUrl
    try {
        & $env:ComSpec /d /c $shellCommand
        $exitCode = $LASTEXITCODE
    } catch {
        throw "工作台服务和页面已通过 HTTP 检查，但 cmd/Windows URL 处理程序未能接受打开请求：$($_.Exception.Message)"
    }
    if ($exitCode -ne 0) { throw "cmd/Windows URL 处理程序返回错误码 $exitCode。" }
    return 'cmd/Windows URL 处理程序已接受打开请求；此返回值不证明隔离会话之外的用户窗口已显示。'
}

try {
    Write-LaunchLog '开始启动工作台。'
    Write-LaunchLog "PowerShell 版本：$($PSVersionTable.PSVersion)；脚本路径：$PSCommandPath"
    if (-not (Test-Path -LiteralPath $server -PathType Leaf)) { throw "找不到工作台服务脚本：$server" }
    if (-not (Test-Path -LiteralPath $htmlFile)) { throw "找不到最终版 HTML：$htmlFile" }
    if (-not (Test-Path -LiteralPath $runtimeDirectory -PathType Container)) { throw "找不到工作台运行目录：$runtimeDirectory" }
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
                    throw "8765 端口已被占用，但占用服务未通过工作台健康检查。请关闭占用该端口的程序后重试。日志：$stderrLog`n$details"
                }
                throw "预览服务启动失败。日志：$stderrLog`n$details"
            }
            if ($timer.Elapsed.TotalSeconds -ge 15) { throw "预览服务未在 15 秒内就绪。日志：$stderrLog" }
            Start-Sleep -Milliseconds 200
        }
    }
    if (-not (Test-WorkbenchReady)) { throw '服务进程已启动，但工作台健康检查未通过（/health 响应不正确）。' }
    if (-not (Test-WorkbenchPage)) { throw '工作台健康检查通过，但最终页面未能通过 HTTP 200/HTML 内容检查。请查看服务日志后重试。' }
    $version = (Get-Item -LiteralPath $htmlFile).LastWriteTimeUtc.Ticks
    $url += '?ui=' + $version
    if (-not $NoBrowser) {
        $browserStatus = Open-WorkbenchBrowser $url
        $result = "工作台服务和页面已验证（HTTP 200）；$browserStatus 地址：$url"
        Write-LaunchLog $result
        Write-Output $result
    } else {
        $result = "工作台服务和页面已验证（HTTP 200）：$url（按参数要求未打开浏览器）"
        Write-LaunchLog $result
        Write-Output $result
    }
} catch {
    $message = '打开工作台失败：' + $_.Exception.Message
    Write-LaunchLog $message
    Write-Host $message -ForegroundColor Red
    Write-Host "启动日志：$launcherLog" -ForegroundColor Yellow
    exit 1
}
