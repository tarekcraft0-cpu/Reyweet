# إعداد نفق Cloudflare ثابت (رابط دائم لا يتغيّر)
# يتطلب: دومين مضاف إلى Cloudflare (خطة مجانية كافية)
#
# مثال:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-stable-tunnel.ps1 -Hostname app.example.com

param(
  [Parameter(Mandatory = $true)]
  [string]$Hostname,
  [string]$TunnelName = "retweet",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cfDir = Join-Path $root "cloudflare"
$tunnelYml = Join-Path $cfDir "tunnel.yml"
$envFile = Join-Path $root ".env"
$cfHome = Join-Path $env:USERPROFILE ".cloudflared"
$certPem = Join-Path $cfHome "cert.pem"

function Set-EnvLine($path, $key, $value) {
  $line = "$key=$value"
  if (-not (Test-Path $path)) {
    Set-Content -Path $path -Value "$line`n" -Encoding utf8
    return
  }
  $text = Get-Content -Path $path -Raw -Encoding utf8
  if ($text -match "(?m)^$key=.*$") {
    $text = $text -replace "(?m)^$key=.*$", $line
  } else {
    $text = $text.TrimEnd() + "`n$line`n"
  }
  Set-Content -Path $path -Value $text -Encoding utf8
}

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  Write-Host "ثبّت cloudflared: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

$Hostname = $Hostname.Trim().ToLower() -replace "^https?://", "" -replace "/.*$", ""
if (-not $Hostname) {
  Write-Host "أدخل hostname صالحاً مثل app.example.com" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "══ إعداد رابط ثابت لـ Retweet ══" -ForegroundColor Cyan
Write-Host "  الدومين: $Hostname"
Write-Host "  اسم النفق: $TunnelName"
Write-Host ""

if (-not (Test-Path $certPem)) {
  Write-Host "1) تسجيل الدخول إلى Cloudflare (يفتح المتصفح مرة واحدة)..." -ForegroundColor Yellow
  & cloudflared tunnel login
  if (-not (Test-Path $certPem)) {
    Write-Host "فشل تسجيل الدخول — أكمل cloudflared tunnel login يدوياً" -ForegroundColor Red
    exit 1
  }
}

Write-Host "2) إنشاء النفق (إن لم يكن موجوداً)..." -ForegroundColor Yellow
$listJson = & cloudflared tunnel list --output json 2>$null
$tunnelId = $null
if ($listJson) {
  try {
    $tunnels = $listJson | ConvertFrom-Json
    $existing = $tunnels | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1
    if ($existing) { $tunnelId = $existing.id }
  } catch { }
}
if (-not $tunnelId) {
  $createOut = & cloudflared tunnel create $TunnelName 2>&1 | Out-String
  if ($createOut -match "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})") {
    $tunnelId = $Matches[1]
  }
}
if (-not $tunnelId) {
  $listJson2 = & cloudflared tunnel list --output json
  $tunnels2 = $listJson2 | ConvertFrom-Json
  $tunnelId = ($tunnels2 | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1).id
}
if (-not $tunnelId) {
  Write-Host "تعذر الحصول على معرف النفق — راجع: cloudflared tunnel list" -ForegroundColor Red
  exit 1
}

$credFile = Join-Path $cfHome "$tunnelId.json"
if (-not (Test-Path $credFile)) {
  Write-Host "ملف credentials غير موجود: $credFile" -ForegroundColor Red
  exit 1
}

Write-Host "3) ربط DNS: $Hostname -> النفق..." -ForegroundColor Yellow
& cloudflared tunnel route dns $TunnelName $Hostname 2>&1 | Out-Host

New-Item -ItemType Directory -Force -Path $cfDir | Out-Null
$config = @"
tunnel: $tunnelId
credentials-file: $credFile

ingress:
  - hostname: $Hostname
    service: http://127.0.0.1:$Port
  - service: http_status:404
"@
Set-Content -Path $tunnelYml -Value $config.TrimEnd() -Encoding utf8

$stableUrl = "https://$Hostname"
Set-EnvLine $envFile "RETWEET_STABLE_URL" $stableUrl
Set-EnvLine $envFile "CF_TUNNEL_NAME" $TunnelName
Set-EnvLine $envFile "RETWEET_PUBLIC_API_URL" $stableUrl

$linksFile = Join-Path $root "PUBLIC_TUNNEL_URL.txt"
Set-Content -Path $linksFile -Value "$stableUrl`n$stableUrl/app/`n" -Encoding utf8

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  تم — الرابط الثابت (لا يتغيّر بعد إعادة التشغيل):       ║" -ForegroundColor Green
Write-Host "║  $stableUrl" -ForegroundColor Green
Write-Host "║  التطبيق: $stableUrl/app/" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "شغّل الآن: npm run public:stable" -ForegroundColor Cyan
Write-Host ""
