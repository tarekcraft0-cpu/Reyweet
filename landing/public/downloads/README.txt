ضع ملفات التثبيت هنا:
  retweet.ipa  — iPhone (موقّع Enterprise أو Ad Hoc)
  retweet.apk  — Android

من جذر المشروع:
  COPY_IPA_PATH=C:\path\to\app.ipa npm run landing:copy-builds
  COPY_APK_PATH=C:\path\to\app.apk npm run landing:copy-builds

ثم:
  npm run landing:build
  npm run landing:preview

الموقع المنشور: https://reyweet.vercel.app
(اختياري) LANDING_SITE_URL إذا غيّرت النطاق
