#Requires -Version 5.1
<#
  دمج نسخة احتياطية في D:\RetweetSocial ثم (اختياري) رفعها للسيرفر.

  الاستخدام:
    cd C:\Users\Alsafy\Downloads\-main\...-main
    .\scripts\merge-and-deploy.ps1

  مع مسار النسخة المستخرجة يدوياً:
    .\scripts\merge-and-deploy.ps1 -MergeSrc "D:\backups\RetweetSocial"

  مع أرشيف tar.gz (يُستخرج تلقائياً):
    .\scripts\merge-and-deploy.ps1 -Archive ".\backups-local\retweet-full-2026-05-26T20-04-08.tar.gz"

  دمج فقط بدون نشر:
    .\scripts\merge-and-deploy.ps1 -SkipDeploy
#>
param(
  [string] $DataRoot = "D:\RetweetSocial",
  [string] $MergeSrc = "",
  [string] $Archive = "",
  [switch] $SkipDeploy
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Test-DbTree([string] $Root) {
  if (-not $Root) { return $false }
  $db = Join-Path $Root "db\messages.json"
  $flat = Join-Path $Root "messages.json"
  return (Test-Path $db) -or (Test-Path $flat)
}

function Get-MessageCount([string] $Root) {
  $p = Join-Path $Root "db\messages.json"
  if (-not (Test-Path $p)) { $p = Join-Path $Root "messages.json" }
  if (-not (Test-Path $p)) { return -1 }
  try {
    $j = Get-Content -Raw -Path $p | ConvertFrom-Json
    if ($j -is [System.Array]) { return $j.Count }
    $props = $j.PSObject.Properties
    return @($props).Count
  } catch {
    return -1
  }
}

# ——— اختيار MERGE_SRC ———
$extractDir = $null
if ($Archive -and (Test-Path $Archive)) {
  $extractDir = Join-Path $env:TEMP "retweet-merge-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
  Write-Host "استخراج الأرشيف: $Archive" -ForegroundColor Cyan
  tar -xzf $Archive -C $extractDir
  $candidates = Get-ChildItem -Path $extractDir -Recurse -Filter "messages.json" -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -match "\\db$" -or $_.DirectoryName -eq $extractDir }
  if ($candidates.Count -eq 0) {
    throw "لم يُعثر على db/messages.json داخل الأرشيف"
  }
  $msgFile = $candidates | Select-Object -First 1
  if ($msgFile.Directory.Name -eq "db") {
    $MergeSrc = Split-Path -Parent $msgFile.Directory.FullName
  } else {
    $MergeSrc = $msgFile.Directory.FullName
  }
} elseif ($MergeSrc -and (Test-Path $MergeSrc)) {
  if (-not (Test-DbTree $MergeSrc)) {
    throw "MERGE_SRC لا يحوي db\messages.json: $MergeSrc"
  }
} else {
  $backupDir = Join-Path $RepoRoot "backups-local"
  $archives = @()
  if (Test-Path $backupDir) {
    $archives = Get-ChildItem -Path $backupDir -Filter "retweet-full-*.tar.gz" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending
  }
  if ($archives.Count -gt 0) {
    Write-Host "نسخ احتياطية محلية:" -ForegroundColor Cyan
    $i = 0
    foreach ($a in $archives) {
      $i++
      $mb = [math]::Round($a.Length / 1MB, 1)
      Write-Host "  [$i] $($a.Name)  ($mb MB)  $($a.LastWriteTime)"
    }
    $pick = Read-Host "اختر رقم النسخة (Enter = الأحدث: 1)"
    if ([string]::IsNullOrWhiteSpace($pick)) { $pick = "1" }
    $idx = [int]$pick - 1
    if ($idx -lt 0 -or $idx -ge $archives.Count) { throw "رقم غير صالح" }
    & $PSCommandPath -Archive $archives[$idx].FullName -DataRoot $DataRoot -SkipDeploy:$SkipDeploy
    exit $LASTEXITCODE
  }
  Write-Host @"

لم يُعثر على نسخة تلقائياً. عيّن أحد الخيارات:

  1) فكّ أرشيف retweet-full-*.tar.gz ثم:
     .\scripts\merge-and-deploy.ps1 -MergeSrc "D:\path\to\RetweetSocial"

  2) أو مباشرة من الأرشيف:
     .\scripts\merge-and-deploy.ps1 -Archive ".\backups-local\retweet-full-....tar.gz"

  3) استرجاع من السيرفر (بدون دمج محلي):
     `$env:CONTABO_SSH_PASSWORD = "..."
     npm run contabo:recover

"@ -ForegroundColor Yellow
  exit 2
}

if (-not (Test-Path $DataRoot)) {
  Write-Host "إنشاء DATA_ROOT: $DataRoot" -ForegroundColor Yellow
  New-Item -ItemType Directory -Path (Join-Path $DataRoot "db") -Force | Out-Null
}

$srcCount = Get-MessageCount $MergeSrc
$dstCount = Get-MessageCount $DataRoot
Write-Host ""
Write-Host "DATA_ROOT (الحالي):  $DataRoot  →  رسائل: $dstCount" -ForegroundColor White
Write-Host "MERGE_SRC (المصدر):  $MergeSrc  →  رسائل: $srcCount" -ForegroundColor White
Write-Host ""

if ($srcCount -ge 0 -and $dstCount -ge 0 -and $srcCount -lt $dstCount) {
  Write-Host "تحذير: المصدر فيه رسائل أقل من الحالي. تأكد أن MERGE_SRC هو النسخة الأكمل (قبل فقدان المحادثات)." -ForegroundColor Yellow
  $ok = Read-Host "متابعة؟ (y/N)"
  if ($ok -notmatch '^[yY]') { exit 0 }
}

$env:DATA_ROOT = $DataRoot
$env:MERGE_SRC = $MergeSrc

Write-Host "بدء الدمج..." -ForegroundColor Cyan
node backend\scripts\merge-db-directory.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "فشل الدمج." -ForegroundColor Red
  exit $LASTEXITCODE
}

$after = Get-MessageCount $DataRoot
Write-Host "بعد الدمج: $after رسالة في $DataRoot\db\messages.json" -ForegroundColor Green

Write-Host "إعادة بناء snapshots محلياً..." -ForegroundColor Cyan
$env:DATA_ROOT = $DataRoot
node backend\scripts\restore-full-database.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "تحذير: restore-full-database فشل — يمكنك المتابعة للنشر أو إصلاح المجلد يدوياً." -ForegroundColor Yellow
}

if ($SkipDeploy) {
  Write-Host "تم الدمج (بدون نشر). للرفع لاحقاً: npm run contabo:deploy" -ForegroundColor Green
  exit 0
}

if (-not $env:CONTABO_SSH_PASSWORD) {
  Write-Host @"

الدمج نجح. قبل النشر عيّن كلمة مرور SSH:
  `$env:CONTABO_SSH_PASSWORD = "YOUR_PASSWORD"
  npm run contabo:deploy

(النشر الآن يأخذ نسخة من السيرفر إلى /root/retweet-pre-sync-*.tar.gz قبل الاستبدال)

"@ -ForegroundColor Yellow
  exit 0
}

Write-Host "رفع إلى السيرفر..." -ForegroundColor Green
npm run contabo:deploy
exit $LASTEXITCODE
