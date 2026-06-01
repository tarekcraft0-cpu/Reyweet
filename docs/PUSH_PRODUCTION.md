# Push Notifications — Production (FCM + iOS + Android)

## Firebase

1. [Firebase Console](https://console.firebase.google.com) → مشروع جديد
2. **Build → Cloud Messaging** — مفعّل افتراضياً
3. أضف تطبيق **Android** (`com.reyweet.app`) → حمّل `google-services.json` → `android/app/`
4. أضف تطبيق **iOS** → حمّل `GoogleService-Info.plist` → Xcode → App target → Copy Bundle Resources
5. **Project settings → Service accounts → Generate new private key** → `serviceAccountKey.json` (لا ترفعه على Git)

### Backend `.env`

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# أو:
# FIREBASE_PROJECT_ID=
# FIREBASE_CLIENT_EMAIL=
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

PUSH_TOKEN_STORE=file
# PUSH_TOKEN_STORE=firestore

FCM_NOTIFICATION_SOUND=default
# FCM_NOTIFICATION_SOUND=insta_sound
```

### Web (اختياري)

`spa/public/firebase-config.json` — مفاتيح الويب + VAPID من Firebase → Cloud Messaging → Web Push certificates.

---

## iOS (Capacitor)

1. Xcode → **Signing & Capabilities** → **+ Push Notifications**
2. **+ Background Modes** → **Remote notifications**
3. Apple Developer → App ID → Push Notifications ON
4. APNs Auth Key (.p8) في Firebase → Project settings → Cloud Messaging → Apple app configuration
5. `npm run ios:prepare` → `pod install` في `ios/App`
6. `AppDelegate.swift` — مسجّل في المستودع (UNUserNotificationCenter + APNs token → Capacitor)

---

## Android

1. `npx cap add android` (إن لم يكن موجوداً)
2. انسخ من `native/android-fcm/`:
   - `PushNotificationHelper.kt`
   - `RetweetFirebaseMessagingService.kt`
   - إلى `android/app/src/main/java/com/reyweet/app/push/`
3. أضف `AndroidManifest.snippet.xml` داخل `<application>`
4. `google-services.json` في `android/app/`
5. `build.gradle`: `com.google.gms.google-services`
6. صوت مخصص: `android/app/src/main/res/raw/insta_sound.mp3`

---

## API

| Method | Path | Body |
|--------|------|------|
| POST | `/save-token` أو `/v1/push/register` | `{ "token", "platform": "ios\|android\|web", "deviceId?" }` |
| POST | `/send-notification` أو `/v1/push/send` | `{ "userId?", "title", "body", "data?" }` |
| DELETE | `/v1/push/register` | `{ "token" }` |

Header: `Authorization: Bearer <JWT>`

---

## اختبار Firebase Console

1. Cloud Messaging → **Send test message**
2. الصق **FCM registration token** من سجلات التطبيق بعد تسجيل الدخول
3. Notification title + body → Send

---

## curl (من السيرفر)

```bash
# حفظ token (بعد تسجيل الدخول)
curl -sS -X POST "https://YOUR_API/save-token" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"token":"FCM_TOKEN_HERE","platform":"android","deviceId":"device-1"}'

# إرسال إشعار
curl -sS -X POST "https://YOUR_API/send-notification" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"title":"Reyweet","body":"اختبار","data":{"type":"CUSTOM","chatId":"abc"}}'
```

---

## التحقق 100%

| الخطوة | المتوقع |
|--------|---------|
| تسجيل دخول + قبول الإشعارات | `POST /save-token` → 200 |
| `GET /v1/push/status` | `configured: true` |
| إرسال curl | `sent: 1` |
| التطبيق في الخلفية | إشعار في شريط النظام |
| التطبيق مغلق (killed) | نفس الإشعار |
| التطبيق مفتوح | `InAppPushToast` أعلى الشاشة |
| النقر على الإشعار | فتح المحادثة / المنشور / الملف |

---

## ملفات المشروع

| منصة | مسار |
|------|------|
| Client | `src/lib/pushNotifications.ts`, `src/lib/pushApi.ts`, `src/components/InAppPushToast.tsx` |
| Backend FCM | `backend/src/lib/fcmAdmin.ts`, `backend/src/lib/fcmMessage.ts` |
| Tokens | `backend/src/push/store.ts` (file أو firestore) |
| Routes | `backend/src/routes/pushRoutes.ts` |
| iOS native | `ios/App/App/AppDelegate.swift` |
| Android reference | `native/android-fcm/*` |
