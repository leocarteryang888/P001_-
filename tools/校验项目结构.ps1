[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$requiredDirectories = @(
    '.agents/skills/p001-selection-software',
    'src/00-项目资料',
    'src/01-过滤器选型',
    'src/02-盘管选型',
    'src/03-整机选型工作台',
    'src/04-3D零件库',
    'references/箱体设计规范',
    'outputs',
    'tools'
)

foreach ($relativePath in $requiredDirectories) {
    $absolutePath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Container)) {
        throw "缺少必需目录：$relativePath"
    }
}

$allowedRootFiles = @('.gitignore', 'AGENTS.md')
$unexpectedRootFiles = Get-ChildItem -LiteralPath $projectRoot -File -Force |
    Where-Object { $_.Name -notin $allowedRootFiles }
if ($unexpectedRootFiles) {
    throw "项目根目录存在散落文件：$($unexpectedRootFiles.Name -join ', ')"
}

$forbiddenNestedDirectories = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -Directory -Recurse -Force |
    Where-Object { $_.Name -in @('src', 'outputs', 'tools') }
if ($forbiddenNestedDirectories) {
    throw "业务模块内存在禁止的嵌套目录：$($forbiddenNestedDirectories.FullName -join ', ')"
}

$htmlEntries = @(
    'src/01-过滤器选型/index.html',
    'src/02-盘管选型/index.html',
    'src/03-整机选型工作台/index.html',
    'src/04-3D零件库/index.html'
)
foreach ($relativeHtml in $htmlEntries) {
    $htmlPath = Join-Path $projectRoot $relativeHtml
    if (-not (Test-Path -LiteralPath $htmlPath -PathType Leaf)) {
        throw "缺少页面入口：$relativeHtml"
    }
    $html = Get-Content -Raw -LiteralPath $htmlPath
    $moduleRoot = Split-Path -Parent $htmlPath
    $matches = [regex]::Matches($html, '(?:src|href)=["''](?<path>[^"''#?]+)')
    foreach ($match in $matches) {
        $assetPath = $match.Groups['path'].Value.Split('?', 2)[0].Split('#', 2)[0]
        if ($assetPath -match '^(?:[a-z]+:|//)') { continue }
        $decodedPath = [Uri]::UnescapeDataString($assetPath)
        if ($decodedPath.Contains('\')) {
            throw "$relativeHtml 的本地资源路径包含无效反斜杠：$assetPath"
        }
        if ($assetPath.StartsWith('/parts/', [StringComparison]::Ordinal)) {
            $partRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'src/04-3D零件库'))
            $decodedPartPath = $decodedPath.Substring('/parts/'.Length)
            if ([IO.Path]::IsPathRooted($decodedPartPath)) {
                throw "$relativeHtml 的零件库路由引用无效：$assetPath"
            }
            $resolvedAsset = [IO.Path]::GetFullPath((Join-Path $partRoot $decodedPartPath.Replace('/', [IO.Path]::DirectorySeparatorChar)))
            $partPrefix = $partRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
            if (-not $resolvedAsset.StartsWith($partPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                throw "$relativeHtml 的零件库路由越出模块目录：$assetPath"
            }
        } elseif ($assetPath.StartsWith('/src/', [StringComparison]::Ordinal)) {
            $rootRelativePath = $decodedPath.Substring(1).Replace('/', [IO.Path]::DirectorySeparatorChar)
            if ([IO.Path]::IsPathRooted($rootRelativePath)) {
                throw "$relativeHtml 的项目资源路由引用无效：$assetPath"
            }
            $resolvedAsset = [IO.Path]::GetFullPath((Join-Path $projectRoot $rootRelativePath))
        } else {
            if ([IO.Path]::IsPathRooted($decodedPath)) {
                throw "$relativeHtml 的模块资源路径不能使用本机绝对路径：$assetPath"
            }
            $moduleRelativePath = $decodedPath.Replace('/', [IO.Path]::DirectorySeparatorChar)
            $resolvedAsset = [IO.Path]::GetFullPath((Join-Path $moduleRoot $moduleRelativePath))
        }
        $workspaceRoot = [IO.Path]::GetFullPath($projectRoot).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
        $workspacePrefix = $workspaceRoot + [IO.Path]::DirectorySeparatorChar
        if (-not $resolvedAsset.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "$relativeHtml 的资源路径越出项目目录：$assetPath"
        }
        if (-not (Test-Path -LiteralPath $resolvedAsset -PathType Leaf)) {
            throw "$relativeHtml 引用了不存在的本地文件：$assetPath"
        }
    }
}

Write-Output '通过：P001 项目目录边界、模块入口和 HTML 本地资源引用均正常。'
