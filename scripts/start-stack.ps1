# Start Retweet backend + SPA (Windows)
$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

foreach ($port in 3000, 3080) {
  netstat -ano | findstr ":$port" | ForEach-Object {
    $procId = ($_ -split '\s+')[-1]
    if ($procId -match '^\d+$' -and $procId -ne '0') { taskkill /F /PID $procId 2>$null }
  }
}
Start-Sleep -Seconds 2

node scripts/sync-lan-api-url.mjs | Out-Host

$lan = '127.0.0.1'
try {
  $lan = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -match '^192\.168\.' -and $_.PrefixOrigin -ne 'WellKnown'
  } | Select-Object -First 1).IPAddress
} catch { }
if (-not $lan) { $lan = '127.0.0.1' }

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; `$env:CORS_ALLOW_ALL='1'; npm run dev" -WindowStyle Minimized
Start-Sleep -Seconds 4
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue; npx vite dev --config vite.spa.config.ts --host 0.0.0.0 --port 3080 --strictPort" -WindowStyle Minimized
Start-Sleep -Seconds 8

Write-Host ""
Write-Host "=== Retweet ready ===" -ForegroundColor Green
Write-Host "  API:  http://${lan}:3000/health"
Write-Host "  App:  http://${lan}:3080/app/"
Write-Host "  Login: t / Tareq_-01"
Write-Host ""

try {
  $h = Invoke-RestMethod "http://127.0.0.1:3000/health" -TimeoutSec 8
  Write-Host "  health ok=$($h.ok) db=$($h.dbOk) users=$($h.usersCount)" -ForegroundColor Cyan
  $body = '{"identifier":"t","password":"Tareq_-01"}'
  $login = Invoke-RestMethod -Uri "http://127.0.0.1:3080/auth/login" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 8
  Write-Host "  login via proxy: OK" -ForegroundColor Cyan
} catch {
  Write-Host "  Warning: server not ready yet - wait and refresh" -ForegroundColor Yellow
  Write-Host $_.Exception.Message
}
