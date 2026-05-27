# نشر Retweet على Contabo VPS

## مهم: نوع قاعدة البيانات

التطبيق **لا يستخدم MySQL/PostgreSQL**. البيانات في مجلد JSON على القرص:

- محلياً: `D:\RetweetSocial`
- على السيرفر: `/var/lib/retweet`

يشمل: `db/*.json`، `snapshots/`، `media/`.

## نسخة احتياطية على جهازك

تم إنشاء نسخة في:

`backups-local/retweet-*.tar.gz`

لإنشاء نسخة يدوياً:

```powershell
$env:DATA_ROOT = "D:/RetweetSocial"
$env:RETWEET_BACKUP_DIR = "C:\Users\Alsafy\Downloads\-main\...-main\backups-local"
node backend/scripts/backup-db.mjs
```

## النشر التلقائي (عندما يفتح SSH)

1. Contabo → VPS → **Running**، وفتح المنافذ **22, 80, 3000** في الجدار الناري.
2. في PowerShell من جذر المشروع:

```powershell
$env:CONTABO_SSH_PASSWORD = "كلمة_مرور_root"
$env:CONTABO_HOST = "109.199.111.29"
$env:CONTABO_PUBLIC_URL = "http://109.199.111.29"
node scripts/contabo-deploy.mjs
```

3. ربط الواجهة (Vercel):

```powershell
$env:RETWEET_PUBLIC_API_URL = "http://109.199.111.29"
npm run build:spa
node scripts/prepare-vercel-static.mjs
# ثم نشر _vercel_site على Vercel
```

4. في Vercel → Environment Variables: `RETWEET_PUBLIC_API_URL` = `http://109.199.111.29`

## أمان

- **غيّر كلمة مرور root** في Contabo بعد أول دخول.
- لا تشارك كلمات المرور في المحادثات أو git.
- استخدم لاحقاً نطاقاً + HTTPS (Let's Encrypt) بدل IP فقط.

## فحص السيرفر

```powershell
Test-NetConnection 109.199.111.29 -Port 22
ssh root@109.199.111.29
pm2 logs retweet-api
curl http://109.199.111.29/health
```
