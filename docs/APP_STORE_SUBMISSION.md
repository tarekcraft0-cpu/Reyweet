# نشر Reyweet على App Store

## قبل الرفع

1. **APNs على VPS** (إشعارات iPhone):
   ```bash
   # ضع AuthKey_XXX.p8 في secrets/apns/
   npm run contabo:configure-apns
   npm run contabo:verify-env
   ```
   يجب أن يظهر `pushIos: true` في `/health`.

2. **نشر الخادم:**
   ```bash
   npm run contabo:deploy:backend
   ```

3. **بناء iOS:**
   ```bash
   npm run build:spa
   npm run ios:prepare
   npm run ios:codemagic
   ```
   أو Xcode Archive من `ios/App`.

4. **فحص الجاهزية:**
   ```bash
   npm run appstore:verify
   ```

## روابط App Store Connect

| الحقل | القيمة |
|--------|--------|
| Privacy Policy URL | `https://reyweet.vercel.app/privacy.html` |
| Terms of Use | `https://reyweet.vercel.app/terms.html` |
| Support URL / Email | `support@reyweet.app` |
| Age Rating | 12+ (محتوى UGC، مراسلة) |

## ميزات مطلوبة من Apple — موجودة في التطبيق

- [x] حذف الحساب داخل التطبيق (الإعدادات)
- [x] سياسة خصوصية + شروط استخدام
- [x] تصدير بيانات المستخدم (JSON)
- [x] `ITSAppUsesNonExemptEncryption` = false
- [x] `PrivacyInfo.xcprivacy`
- [x] أوصاف أذونات الكاميرا/الميكروفون في Info.plist

## اختياري لكن موصى به

- **TURN** للمكالمات: عيّن `VITE_TURN_URL` عند بناء SPA
- **TestFlight** أسبوع مع 10–20 مستخدم
- لقطات شاشة: خلاصة، محادثة، ريلز، إعدادات

## ملاحظات المراجعة

- وضّح في «ملاحظات المراجع» حساب تجريبي (بريد + كلمة مرور) إن طُلب.
- لا تفعّل ميزات «قريباً» ظاهرة للمراجع — تم إخفاء أزرار الكامرة غير الجاهزة.
