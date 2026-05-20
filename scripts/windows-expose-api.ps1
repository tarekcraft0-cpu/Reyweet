# يعرض Retweet API (منفذ 3000) على الإنترنت عبر Cloudflare Tunnel
# انسخ الرابط الناتج إلى Vercel: RETWEET_PUBLIC_API_URL

$ErrorActionPreference = "Stop"
Write-Host "تأكد أن الخادم يعمل: npm run backend:dev" -ForegroundColor Cyan
Write-Host "جاري فتح النفق على http://localhost:3000 ..." -ForegroundColor Yellow
Write-Host ""
Write-Host "بعد ظهور الرابط https://.... ضعه في Vercel -> RETWEET_PUBLIC_API_URL ثم Redeploy" -ForegroundColor Green
Write-Host ""

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  Write-Host "cloudflared غير مثبت. جرّب: winget install Cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

& cloudflared tunnel --url http://localhost:3000
