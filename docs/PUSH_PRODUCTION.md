# إشعارات الدفع — إنتاج (VPS → APNs مباشرة)

الإشعارات تُرسل من **سيرفر Retweet على VPS** إلى **Apple Push Notification service (APNs)**.  
لا يُستخدم Firebase Cloud Messaging. توكنات الأجهزة تُخزَّن في `{DATA_ROOT}/push_tokens.json`.

## إعداد Apple

1. [Apple Developer](https://developer.apple.com) → **Keys** → أنشئ مفتاح **Apple Push Notifications (.p8)**
2. سجّل `Key ID` و `Team ID`
3. Xcode → **Signing & Capabilities** → **Push Notifications** + **Background Modes** → **Remote notifications**
4. Bundle ID: `com.reyweet.app` (أو ما في `APNS_BUNDLE_ID`)

## Backend `.env` على VPS

```env
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_BUNDLE_ID=com.reyweet.app
APNS_KEY_PATH=/opt/retweet/secrets/AuthKey_XXXXXXXXXX.p8
# أو APNS_KEY_P8="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APNS_PRODUCTION=1
APNS_NOTIFICATION_SOUND=default
PUSH_TOKEN_STORE=file
```

بعد التعديل: `npm run contabo:deploy` أو أعد تشغيل `pm2 restart retweet-api`.

## التطبيق (iPhone)

1. `npm run ios:prepare` ثم `pod install` في `ios/App`
2. لا Firebase في `Podfile` — Capacitor `PushNotifications` يسجّل توكن APNs
3. التطبيق يرسل التوكن إلى `POST /v1/push/register` مع JWT

## API

| Method | Path | Body |
|--------|------|------|
| POST | `/v1/push/register` | `{ "token", "platform": "ios", "deviceId?" }` |
| POST | `/v1/push/send` | `{ "title", "body", "data?" }` |
| GET | `/v1/push/status` | — |
| GET | `/health` | `pushConfigured: true` عند ضبط APNs |

## اختبار

1. افتح التطبيق → الإعدادات → الإشعارات → فعّل الدفع
2. من الإعدادات: **إرسال إشعار تجريبي** (أو `POST /v1/push/send` مع JWT)
3. `curl -s https://YOUR_API/health` — تأكد `pushConfigured: true`

## ملاحظة

على iOS لا يمكن تجاوز APNs — Apple هي بوابة التسليم. الفرق أن **المرسل هو VPS أنت** وليس Firebase.
