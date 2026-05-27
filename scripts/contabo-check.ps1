# فحص اتصال Contabo قبل النشر
param(
  [string]$Host = "109.199.111.29"
)

Write-Host "`n=== فحص Contabo ($Host) ===`n" -ForegroundColor Cyan
$ping = Test-NetConnection -ComputerName $Host -WarningAction SilentlyContinue
Write-Host "Ping: $($ping.PingSucceeded)"
foreach ($p in 22, 80, 443, 3000) {
  $t = Test-NetConnection -ComputerName $Host -Port $p -WarningAction SilentlyContinue
  $ok = if ($t.TcpTestSucceeded) { "OK" } else { "مغلق" }
  Write-Host "Port $p : $ok"
}
if (-not (Test-NetConnection -ComputerName $Host -Port 22 -WarningAction SilentlyContinue).TcpTestSucceeded) {
  Write-Host "`nلا يمكن التحقق من كلمة المرور — SSH غير reachable (جدار ناري أو VPS متوقف).`n" -ForegroundColor Yellow
  Write-Host "Contabo Panel -> VPS -> Firewall -> Allow TCP 22, 80`n"
  exit 1
}
Write-Host "`nSSH مفتوح — شغّل: npm run contabo:deploy`n" -ForegroundColor Green
