# تثبيت iPhone من الموقع (OTA) — Reyweet

زر **«تثبيت على iPhone»** على https://reyweet.vercel.app يعمل فقط مع **IPA موقّع** من Apple.

## مرة واحدة — Codemagic + Apple Developer

1. حساب [Apple Developer](https://developer.apple.com) (99$/سنة) أو فريق موجود.
2. في [codemagic.io](https://codemagic.io) → المشروع → **Team settings** → **codemagic.yaml** → فعّل الـ workflow.
3. **Integrations** → **Apple Developer Portal** (مفتاح App Store Connect API).
4. شغّل workflow: **`retweet-ios-ota-signed`**
5. عرّف (اختياري) `RETWEET_PUBLIC_API_URL` = رابط نفق API من `npm run stack:reyweet`
6. بعد النجاح حمّل Artifact: **`Reyweet-signed.ipa`**

## رفع IPA إلى الموقع

```powershell
$env:COPY_IPA_PATH="C:\path\to\Reyweet-signed.ipa"
$env:IOS_IPA_SIGNED="1"
npm run ios:publish
npm run vercel:deploy
```

## على PC دائماً (خادم + قاعدة البيانات)

```powershell
npm run stack:reyweet
```

## التطبيق = الموقع

- WebView: `https://reyweet.vercel.app/app/`
- تسجيل الدخول نفس الموقع عبر API النفق → `D:\RetweetSocial`

## IPA غير موقّع (الحالي)

لا يثبت من Safari. استخدم workflow **`retweet-ios-ota-signed`** ثم `ios:publish` مع `IOS_IPA_SIGNED=1`.
