# Retweet — أقرب طريقة لتشغيل التطبيق على الآيفون من Windows (Expo Go)
$ErrorActionPreference = "Stop"
$mobile = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $mobile
Set-Location $root

Write-Host ""
Write-Host "=== Retweet — تثبيت/تشغيل على الآيفون (Windows) ===" -ForegroundColor Cyan
Write-Host ""

node scripts/sync-mobile-ios.mjs --public
Set-Location $mobile
npm install

Write-Host ""
Write-Host "ملاحظة: التثبيت الأصلي بالكابل يتطلب Mac + Xcode." -ForegroundColor Yellow
Write-Host "من Windows استخدم Expo Go (مجاني من App Store):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1) على الآيفون: حمّل Expo Go من App Store" -ForegroundColor White
Write-Host "  2) على الكمبيوتر سيظهر QR في الطرفية التالية" -ForegroundColor White
Write-Host "  3) افتح Expo Go وامسح الرمز (أو الكاميرا)" -ForegroundColor White
Write-Host ""
Write-Host "للبناء الأصلي بدون Mac لاحقاً:" -ForegroundColor DarkYellow
Write-Host "  cd mobile" -ForegroundColor Gray
Write-Host "  npx eas-cli login" -ForegroundColor Gray
Write-Host "  npx eas-cli device:create" -ForegroundColor Gray
Write-Host "  npx eas-cli build -p ios --profile personal" -ForegroundColor Gray
Write-Host ""

npx expo start --tunnel
