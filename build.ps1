# Builds dist/courtlistener.xpi from the contents of plugin/.
# manifest.json must end up at the root of the archive.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$plugin = Join-Path $root "plugin"
$dist = Join-Path $root "dist"
$xpi = Join-Path $dist "courtlistener.xpi"
$zip = Join-Path $dist "courtlistener.zip"

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $xpi) { Remove-Item $xpi -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }

Compress-Archive -Path (Join-Path $plugin '*') -DestinationPath $zip -Force
Move-Item $zip $xpi -Force
Write-Host "Built $xpi"
