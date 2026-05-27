# إعداد البريد (أكواد التسجيل واستعادة كلمة المرور)

الخادم لا يرسل أي بريد حتى تُفعَّل SMTP في **`backend/.env`** على جهازك قبل تشغيل `npm run contabo:deploy`، أو يدوياً في **`/opt/retweet/app/.env`** على السيرفر.

## Gmail (موصى به)

1. حساب Google → الأمان → التحقق بخطوتين (فعّلها إن لم تكن مفعّلة).
2. أنشئ **App Password**: Google Account → Security → App passwords → اسم التطبيق ثم انسخ الرمز الـ 16 خانة.
3. في `backend/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=your@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx
SMTP_FROM="Retweet <your@gmail.com>"
```

4. على السيرفر بعد التعديل:

```bash
pm2 restart retweet-api
```

## التحقق السريع

اطلب:

`GET http://YOUR_VPS_IP/health`

في الاستجابة يجب أن ترى `"smtpConfigured":true` بعد ضبط المتغيرات الصحيحة وإعادة تشغيل PM2.

## تعطيل كود التحقق عند الإنشاء (اختبار فقط — غير آمن)

في `.env` على الخادم:

```env
SIGNUP_OTP_REQUIRED=0
```

لا تستخدم هذا في إنتاج عام.
