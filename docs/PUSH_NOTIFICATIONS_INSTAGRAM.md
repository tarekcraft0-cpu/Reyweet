# نظام إشعارات Retweet (أسلوب Instagram)

المشروع **يستخدم بالفعل** Firebase Cloud Messaging عبر Capacitor + `firebase-admin` على الخادم. هذا الملف يربط دليل Firebase الكلاسيكي بما هو مُنفَّذ هنا.

## التدفق

```
إجراء (رسالة / إعجاب / متابعة / تعليق)
        ↓
الخادم (Node.js)
        ↓
push_tokens.json + firebase-admin
        ↓
FCM → APNs (iOS) / FCM (Android) / Web Push
        ↓
الجهاز — نقرة → فتح محادثة / بروفايل / منشور / لوحة الإشعارات
```

## 1) Firebase Console

1. [Firebase Console](https://console.firebase.google.com) — مشروع جديد أو موجود
2. تفعيل **Cloud Messaging**
3. إضافة تطبيق **Android** → `google-services.json` → `android/app/`
4. إضافة تطبيق **iOS** → `GoogleService-Info.plist` → Xcode (مجلد App)
5. iOS: رفع **APNs Auth Key (.p8)** في Project Settings → Cloud Messaging
6. Web: مفاتيح Vite في `.env` (انظر `docs/PUSH_NOTIFICATIONS.md`)

## 2) الخادم (بدل الذاكرة المؤقتة)

| دليلك | Retweet |
|--------|---------|
| `POST /save-token` | `POST /v1/push/register` أو **`POST /save-token`** (نفس المعنى، يتطلب JWT) |
| `users[userId] = token` | `backend/data/push_tokens.json` (حتى 8 أجهزة لكل مستخدم) |
| `POST /send-notification` | `POST /v1/push/send` أو **`POST /send-notification`** |

**تسجيل الرمز (بعد تسجيل الدخول):**

```http
POST /v1/push/register
Authorization: Bearer <JWT>
Content-Type: application/json

{ "token": "<FCM_TOKEN>", "platform": "ios" }
```

**إرسال تجريبي:**

```http
POST /v1/push/send
Authorization: Bearer <JWT>

{ "title": "اختبار", "body": "مرحباً" }
```

**متغيرات `backend/.env`:**

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# أو FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
FCM_NOTIFICATION_SOUND=default
```

## 3) العميل (بدل Kotlin/Swift اليدوي)

- **iOS / Android:** `@capacitor/push-notifications` — `src/lib/pushNotifications.ts`
- **Web:** Firebase Messaging + `spa/public/firebase-messaging-sw.js`
- التهيئة تلقائية بعد الدخول من `App.tsx`

لا حاجة لكتابة `MyFirebaseMessagingService` أو `AppDelegate` يدوياً إذا بقيت على Capacitor؛ فقط ضع ملفات Firebase في المشروع الأصلي.

## 4) إشعارات تلقائية (Instagram-style)

| الحدث | FCM |
|--------|-----|
| رسالة خاصة / مجموعة | `sendNewChatMessagePush` |
| إعجاب / تعليق / إعادة نشر | `deliverNotification` → `sendInAppNotificationPush` |
| متابعة / طلب متابعة | نفس المسار |
| منشن في البايو | نفس المسار |

**حقل `data.type`:** `MESSAGE`, `LIKE`, `COMMENT`, `FOLLOW`, `FOLLOW_REQUEST`, …

## 5) صوت مخصص

```env
FCM_NOTIFICATION_SOUND=insta_sound
```

- **Android:** `android/app/src/main/res/raw/insta_sound.mp3`
- **iOS:** `insta_sound.caf` في حزمة Xcode

## 6) فتح الشاشة من الإشعار

| النوع | السلوك |
|--------|--------|
| `MESSAGE` | تبويب المحادثات + فتح `chatId` |
| `FOLLOW` / `FOLLOW_REQUEST` | بروفايل المرسل |
| `LIKE` / `COMMENT` | الرئيسية + المنشور |
| أخرى | لوحة الإشعارات |

## 7) الملفات الأساسية

| مسار | الغرض |
|------|--------|
| `backend/src/lib/fcmAdmin.ts` | إرسال FCM |
| `backend/src/lib/pushPresentation.ts` | عنوان/نص بأسلوب Instagram |
| `backend/src/db/pushTokens.ts` | تخزين الرموز |
| `backend/src/routes/pushRoutes.ts` | REST API |
| `src/lib/pushNotifications.ts` | Capacitor + Web |
| `src/lib/pushDeepLink.ts` | توجيه النقر |

للتفاصيل الكاملة: [`PUSH_NOTIFICATIONS.md`](./PUSH_NOTIFICATIONS.md)
