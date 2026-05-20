# يوضح لماذا لا يعمل بناء iOS على Windows
Write-Host ""
Write-Host "=== Retweet iOS على Windows ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "expo run:ios و prebuild لـ ios لا يعملان على Windows (قيود Apple + Expo)." -ForegroundColor Yellow
Write-Host ""
Write-Host "البدائل:" -ForegroundColor Green
Write-Host "  1) GitHub Actions (Mac مجاني): ادفع المشروع وشغّل workflow ios-ipa-sideload"
Write-Host "  2) EAS Build + Apple ID مجاني (ليس 99$): npm run mobile:ipa:build"
Write-Host "  3) جهاز Mac + Xcode: npm run mobile:ios:install"
Write-Host ""
Write-Host "Sideloadly (Windows): https://sideloadly.io/" -ForegroundColor Cyan
Write-Host ""
