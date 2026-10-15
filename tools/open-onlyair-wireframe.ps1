param(
    [switch]$Flow,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$wireframeName = if ($Flow) { '01_流程图.html' } else { '02_四页工作台线框.html' }
$targetPath = Join-Path $repoRoot (Join-Path 'outputs/03-整机选型工作台/ONLYAIR研究与六步DOM_2026-10-07' $wireframeName)
$absoluteUri = ([System.Uri]::new([System.IO.Path]::GetFullPath($targetPath))).AbsoluteUri

$installRoots = @(
    [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ProgramFilesX86),
    $env:ProgramFiles,
    $env:LOCALAPPDATA
) | Where-Object { $_ }

$browserCandidates = @()
foreach ($relativeBrowserPath in @(
    'Microsoft/Edge/Application/msedge.exe',
    'Google/Chrome/Application/chrome.exe'
)) {
    foreach ($installRoot in $installRoots) {
        $candidatePath = Join-Path $installRoot $relativeBrowserPath
        if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
            $browserCandidates += $candidatePath
        }
    }
}

$browserPath = $browserCandidates | Select-Object -First 1

if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
    throw "Wireframe page not found: $targetPath"
}

if ($CheckOnly) {
    [pscustomobject]@{
        Target = [System.IO.Path]::GetFullPath($targetPath)
        Browser = if ($browserPath) { $browserPath } else { '(not found)' }
        URL = $absoluteUri
    } | Format-List
    return
}

if (-not $browserPath) {
    throw 'Microsoft Edge or Google Chrome was not found in the standard installation locations.'
}

$quotedUri = '"{0}"' -f $absoluteUri
$arguments = '--new-window {0}' -f $quotedUri
Start-Process -FilePath $browserPath -ArgumentList $arguments
