# خادم Retweet المحلي + قاعدة البيانات على القرص D

## التشغيل السريع

```bash
cd backend
npm install
npm run dev
```

الخادم يعمل على **http://localhost:3000** ويخزّن البيانات في **`D:\RetweetSocial`** (قابل للتغيير عبر `DATA_ROOT` في `backend/.env`).

## الواجهة (Vite)

من جذر المشروع:

```bash
npm install
npm run dev
```

تأكد من `.env`:

```
VITE_API_URL=http://localhost:3000
```

## الهاتف (نفس شبكة الـ Wi‑Fi)

1. `ipconfig` → عنوان IPv4 (مثل `192.168.100.166`)
2. `backend/.env`: `PUBLIC_BASE_URL=http://<IPv4>:3000`
3. `.env`: `VITE_API_URL_MOBILE=http://<IPv4>:3000`
4. `mobile/app.json` → `expo.extra.apiUrl` بنفس العنوان

## هيكل التخزين على D

| المسار | المحتوى |
|--------|---------|
| `D:\RetweetSocial\db\users.json` | الحسابات (إيميل، يوزر، كلمة مرور مشفّرة) |
| `D:\RetweetSocial\db\posts.json` | المنشورات |
| `D:\RetweetSocial\db\likes.json` | الإعجابات |
| `D:\RetweetSocial\db\follows.json` | المتابعات |
| `D:\RetweetSocial\db\messages.json` | رسائل الدردشة (مرسل، مستقبل، نص، وقت) |
| `D:\RetweetSocial\snapshots\` | لقطة حالة التطبيق الكاملة لكل مستخدم |
| `D:\RetweetSocial\media\` | صور وفيديوهات مضغوطة (WebP / H.264) |

## ضغط الميديا

- الصور: **sharp** → WebP بعرض أقصى 1920px
- الفيديو: **ffmpeg** → MP4 H.264 (يتطلب تثبيت ffmpeg على PATH)
- عند حفظ الحالة (`PUT /v1/app-state`) تُستبدل روابط `data:` تلقائياً بملفات على القرص D
- رفع مباشر: `POST /v1/media/upload` (حقل `file`)

## رسائل الدردشة

- `POST /v1/messages` — حفظ فوري عند الإرسال (`chatId`, `receiverId`, `type`, `content`, `createdAt`, …)
- `GET /v1/chats/:chatId/messages` — جلب رسائل محادثة من `messages.json`
- عند `GET /v1/app-state` تُدمج الرسائل المحفوظة في كل محادثة تلقائياً

## متطلبات ffmpeg (للفيديو)

ثبّت [FFmpeg](https://ffmpeg.org/download.html) وأضفه إلى PATH، ثم أعد تشغيل الخادم.
