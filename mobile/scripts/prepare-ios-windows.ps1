# تجهيز تطبيق iOS من Windows (قبل التثبيت على Mac بالكابل)
$ErrorActionPreference = "Stop"
$mobile = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $mobile
Set-Location $root

Write-Host ""
Write-Host "=== Retweet - iOS prepare (Windows) ===" -ForegroundColor Cyan
Write-Host ""

node scripts/sync-mobile-ios.mjs --public
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Set-Location $mobile
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host ""
Write-Host "Next on Mac (iPhone connected via cable):" -ForegroundColor Yellow
Write-Host '  cd path\to\project' -ForegroundColor White
Write-Host '  npm run mobile:ios:install' -ForegroundColor White
Write-Host ""
