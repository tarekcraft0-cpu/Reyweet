# تطبيق Retweet لـ iOS (Capacitor — بدون Expo)

التطبيق **نفس** [reyweet.vercel.app/app/](https://reyweet.vercel.app/app/) داخل WebView أصلي.  
البيانات والحسابات من **خادمك** و**قاعدة D:** عبر نفس رابط API المضمّن في الموقع.

## البنية

| المكوّن | المسار |
|--------|--------|
| إعداد Capacitor | `capacitor.config.ts` |
| تهيئة + بناء | `scripts/prepare-capacitor-ios.mjs` |
| مشروع Xcode | `ios/` (يُنشأ بـ `npx cap add ios`) |
| Codemagic | `codemagic.yaml` → workflow **`retweet-ios-capacitor-ipa`** |
| IPA الناتج | `build/ios/ipa/Retweet-unsigned.ipa` |

مجلد **`mobile/` (Expo) مُزال** — لا تستخدمه.

## Codemagic

1. اربط المستودع على [codemagic.io](https://codemagic.io)
2. شغّل workflow: **`retweet-ios-capacitor-ipa`**
3. (اختياري) Environment variables:
   - `RETWEET_PUBLIC_API_URL` = رابط نفق API من `npm run stack:reyweet`
4. حمّل Artifact: **`Retweet-unsigned.ipa`**
5. وقّع IPA بشهادة Apple أو أداة التوقيع الصينية

## على الكمبيوتر (Mac)

```bash
npm ci
npm run stack:reyweet    # API + نفق — يبقى شغالاً
npm run ios:prepare      # بناء SPA + cap sync
npx cap open ios         # Xcode
```

## المتغيرات

| المتغير | الغرض |
|---------|--------|
| `RETWEET_PUBLIC_API_URL` | نفق Cloudflare → API + قاعدة البيانات |
| `CAPACITOR_WEB_APP_URL` | افتراضي `https://reyweet.vercel.app/app` |

## ملاحظات

- يجب أن يبقاء **النفق + الخادم** شغّالين على PC وإلا الموقع والتطبيق لا يسجلان دخولاً.
- `bundleId`: `com.retweetmobile.app`
- للتطوير على LAN: `CAPACITOR_WEB_APP_URL=http://192.168.x.x:3080/app` و `CAPACITOR_ALLOW_HTTP=1`
