# أعد البناء بعد تسجيل الآيفون وربط Apple ID على expo.dev
$ErrorActionPreference = "Stop"
if (-not $env:EXPO_TOKEN) {
  Write-Host "عيّن التوكن: `$env:EXPO_TOKEN = 'your-token'" -ForegroundColor Yellow
  exit 1
}
Set-Location (Split-Path (Split-Path $PSScriptRoot))
Set-Location ..
node scripts/eas-ios-build.mjs
