#Requires -Version 5.1
<#
  استعادة على السيرفر ثم (اختياري) رفع D:\RetweetSocial إن كان أغنى محلياً.

  .\scripts\recover-and-deploy.ps1
#>
param(
  [switch] $DeployLocal  # خطر: يستبدل السيرفر بـ D:\RetweetSocial — لا تستخدمه بعد recover ناجح
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not $env:CONTABO_SSH_PASSWORD) {
  $sec = Read-Host "Contabo SSH password (root@109.199.111.29)" -AsSecureString
  $env:CONTABO_SSH_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  )
}

Write-Host "`n[1/2] دمج النسخ المحلية في D:\RetweetSocial..." -ForegroundColor Cyan
$env:DATA_ROOT = "D:\RetweetSocial"
npm run data:merge-all
node backend\scripts\restore-messages-from-snapshots.mjs

Write-Host "`n[2/2] استعادة من أرشيفات السيرفر (/root/retweet-pre-sync-*)..." -ForegroundColor Cyan
npm run contabo:recover
if ($LASTEXITCODE -ne 0) {
  Write-Host "فشل استعادة السيرفر — راجع كلمة المرور أو pm2 logs" -ForegroundColor Red
  exit $LASTEXITCODE
}

if ($DeployLocal) {
  Write-Host "`n[3/3] رفع D:\RetweetSocial إلى السيرفر (يستبدل بيانات السيرفر!)..." -ForegroundColor Yellow
  npm run contabo:deploy
} else {
  Write-Host "`nتمت الاستعادة على السيرفر. افتح التطبيق وحدّث (Ctrl+Shift+R)." -ForegroundColor Green
  Write-Host "لا تُشغّل contabo:deploy الآن إلا إذا كنت متأكداً أن نسختك المحلية أغنى." -ForegroundColor Yellow
}
