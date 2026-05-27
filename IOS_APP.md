# تطبيق Retweet لـ iOS (Capacitor — بدون Expo)

التطبيق **نفس** [reyweet.vercel.app/app/](https://reyweet.vercel.app/app/) داخل WebView أصلي.  
البيانات والحسابات من **خادمك** و**قاعدة D:** عبر نفس رابط API المضمّن في الموقع.

## البنية

| المكوّن | المسار |
|--------|--------|
| إعداد Capacitor | `capacitor.config.ts` |
| تهيئة + بناء | `scripts/prepare-capacitor-ios.mjs` |
| مشروع Xcode (المصدر) | `ios/App/` |
| **ملف IPA الجاهز** | **`ios/build/Reyweet-ready.ipa`** |

### أيقونة التطبيق على الآيفون

- المصدر الوحيد: **`src/assets/logo.png`** (شعار R).
- عند `npm run ios:package` يُستبدل كل `AppIcon*.png` ويُحذف **`Assets.car`** إن وُجد (كان يعرض أيقونة Capacitor القديمة).
- بعد التثبيت: احذف النسخة القديمة من الشاشة الرئيسية ثم ثبّت من جديد.
- تحقق: `npm run ios:verify-icon`
| نسخة تحميل الموقع | `landing/public/downloads/retweet.ipa` |
| Codemagic OTA (موقّع) | **`retweet-ios-ota-signed`** |
| Codemagic تجريبي | **`retweet-ios-capacitor-ipa`** |
| دليل OTA | [IOS_OTA_SETUP.md](./IOS_OTA_SETUP.md) |

مجلد **`mobile/` (Expo) مُزال** — لا تستخدمه.

## التثبيت من الموقع (OTA)

1. Codemagic + Apple Developer — راجع **[IOS_OTA_SETUP.md](./IOS_OTA_SETUP.md)**
2. شغّل **`retweet-ios-ota-signed`**
3. انسخ الموقّع إلى `ios/build/Reyweet-ready.ipa` ثم `npm run ios:publish`
4. `npm run vercel:deploy`
5. من Safari: **تثبيت على iPhone** على https://reyweet.vercel.app

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
- `bundleId`: `com.reyweet.app`
- للتطوير على LAN: `CAPACITOR_WEB_APP_URL=http://192.168.x.x:3080/app` و `CAPACITOR_ALLOW_HTTP=1`
