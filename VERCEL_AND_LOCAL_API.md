# الموقع الرسمي: https://reyweet.vercel.app

الواجهة على **Vercel** (رابط ثابت).  
الخادم وقاعدة البيانات على جهازك: **D:\RetweetSocial**.

## التشغيل اليومي (خطوتان)

### 1) API + نفق (بدون موقع محلي trycloudflare)

```bash
npm run api:tunnel
```

انسخ الرابط الذي يظهر (مثل `https://xxxx.trycloudflare.com`) — هذا **API فقط**.

### 2) نشر الواجهة على Vercel

```bash
npm run vercel:build
npm run vercel:deploy
```

أو يدوياً في [Vercel Dashboard](https://vercel.com) → **reyweet** → **Environment Variables**:

| الاسم | القيمة |
|--------|--------|
| `RETWEET_PUBLIC_API_URL` | رابط النفق من الخطوة 1 |

ثم **Redeploy**.

## الروابط

| ماذا | أين |
|------|-----|
| الموقع + التطبيق | https://reyweet.vercel.app/app/ |
| الحسابات والرسائل | `D:\RetweetSocial` على جهازك |
| API للإنترنت | نفق Cloudflare (من `api:tunnel`) |

## تطبيق الجوال

```bash
npm run mobile:sync -- --vercel
```

## ملاحظات

- لا تستخدم `public:launch` كموقع رئيسي — كان نسخة محلية مؤقتة على trycloudflare.
- إذا أوقفت `api:tunnel`، يتوقف تسجيل الدخول على Vercel حتى تعيد تشغيله.
- للرابط الثابت للـ API أيضاً: `npm run tunnel:setup` ثم `npm run public:stable`.
