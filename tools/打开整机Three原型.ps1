param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot '打开整机选型工作台.ps1'
if ($NoBrowser) { & $launcher -NoBrowser }
else { & $launcher }
