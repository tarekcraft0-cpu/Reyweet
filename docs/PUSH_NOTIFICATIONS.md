# إشعارات الدفع (FCM) — Retweet

## نظرة عامة

- **الويب (PWA):** Firebase JS SDK + Service Worker `firebase-messaging-sw.js`
- **Android / iOS:** Capacitor `@capacitor/push-notifications` + ملفات Firebase Native
- **الخادم:** `firebase-admin` يرسل عبر FCM عند رسالة جديدة

---

## 1) إنشاء مشروع Firebase

1. افتح [Firebase Console](https://console.firebase.google.com/)
2. أنشئ مشروعاً (أو استخدم موجوداً)
3. أضف تطبيق **Web** — انسخ `apiKey`, `projectId`, `messagingSenderId`, `appId`
4. **Cloud Messaging** → **Web Push certificates** → أنشئ زوج مفاتيح → انسخ **VAPID key**
5. أضف تطبيق **Android** — حمّل `google-services.json`
6. أضف تطبيق **iOS** — حمّل `GoogleService-Info.plist`
7. في iOS: ارفع **APNs Auth Key** (.p8) في Firebase → Project Settings → Cloud Messaging

---

## 2) حساب الخدمة (Backend)

Project Settings → Service accounts → **Generate new private key**

في `backend/.env` (أحد الخيارين):

```env
# JSON كامل في سطر واحد (مفضل على السيرفر)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# أو متغيرات منفصلة
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 3) الواجهة (Vite / SPA)

في `.env` أو متغيرات بناء Vercel:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

قبل البناء:

```bash
node scripts/write-firebase-messaging-config.mjs
npm run build:spa
```

يُحدَّث `spa/public/firebase-messaging-config.json` ليستخدمه الـ Service Worker.

---

## 4) Android (Capacitor)

1. ضع `google-services.json` في:
   - `android/app/google-services.json`
2. في `android/build.gradle` (project): `classpath 'com.google.gms:google-services:4.4.2'`
3. في `android/app/build.gradle`: `apply plugin: 'com.google.gms.google-services'`
4. أعد بناء التطبيق: `npm run ios:prepare` / Gradle sync

---

## 5) iOS (Capacitor)

1. ضع `GoogleService-Info.plist` في مشروع Xcode (مجلد App)
2. في Xcode → Signing & Capabilities → **Push Notifications**
3. **Background Modes** → Remote notifications
4. تأكد من ربط APNs في Firebase Console

---

## 6) API الخادم

| Method | Path | الوصف |
|--------|------|--------|
| GET | `/v1/push/status` | هل FCM مُعدّ؟ |
| POST | `/v1/push/register` | حفظ token `{ token, platform: ios\|android\|web }` |
| DELETE | `/v1/push/register` | إزالة token |
| POST | `/v1/push/send` | إرسال تجريبي `{ title, body, userId? }` |

**إرسال تلقائي:** عند `POST /v1/messages` يُرسل إشعار للمستلم (عنوان = اسم المرسل، نص = معاينة الرسالة).

---

## 7) فتح المحادثة من الإشعار

- Native: `pushNotificationActionPerformed` → حدث `retweet-open-chat`
- Web (خلفية): نقرة الإشعار → `retweet-open-chat` أو `?openChat=chatId`

---

## 8) اختبار سريع

```bash
# بعد تسجيل الدخول من التطبيق (يُسجَّل token تلقائياً)
curl -X POST https://YOUR_API/v1/push/send \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"title":"اختبار","body":"مرحباً من FCM"}'
```

---

## الملفات المضافة في المشروع

| مسار | الغرض |
|------|--------|
| `backend/src/db/pushTokens.ts` | تخزين رموز FCM |
| `backend/src/lib/fcmAdmin.ts` | إرسال FCM |
| `backend/src/routes/pushRoutes.ts` | REST API |
| `src/lib/pushNotifications.ts` | تهيئة العميل |
| `src/lib/firebaseClient.ts` | إعدادات Firebase للويب |
| `spa/public/firebase-messaging-sw.js` | Service Worker |
