# Retweet: موبايل (iPhone / Samsung) + قواعد البيانات

## خيار أ — مزامنة Supabase (JSON لكل مستخدم)

1. أنشئ مشروعاً في Supabase.
2. نفّذ `supabase/schema.sql` من محرر SQL.
3. انسخ `.env.example` إلى `.env` واملأ:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

عندها تُحفظ الحالة في `app_user_state`. إذا فعّلت **خادم Retweet API** أدناه (`VITE_API_URL`) فالمزامنة عبر Supabase تُعطّل تلقائياً حتى لا يتعارض مصدران.

## خيار ب — خادمك (Prisma + Hono + JWT + لقطة `AppState`)

1. شغّل PostgreSQL (مثلاً عبر `docker compose up -d`).
2. `npm run db:generate` ثم `npm run db:push` (واختيارياً `npm run db:seed`).
3. شغّل API: `npm run api:dev` (افتراضياً المنفذ `8788`).
4. في `.env` للعميل (Vite) — **عنوان IPv4 لجهاز الكمبيوتر** (نفس شبكة الواي فاي)، وليس `localhost` إذا أردت أن يتصل الآيفون أو Capacitor:
   - `VITE_API_URL=http://192.168.1.100:8788`
   - `VITE_API_URL_MOBILE=http://192.168.1.100:8788`  
   استبدل `192.168.1.100` بقيمة `ipconfig` (ويندوز) أو `ifconfig` (ماك).

تفاصيل الخادم: راجع `SERVER_AND_DATABASE.md`.

### iPhone (iOS) — HTTP على الشبكة المحلية

التطبيقات ترفض غالباً `http://` غير المشفّر (ATS). للتطوير فقط يمكنك في Xcode بعد `npx cap add ios` إضافة استثناء في `Info.plist` لنطاقك أو تفعيل **Local Network**. للإنتاج استخدم **HTTPS** على نطاق حقيقي.

### Samsung (Android)

في `capacitor.config.ts` مفعّل `server.cleartext: true` لتسهيل استدعاء `http://` على LAN أثناء التطوير. قبل النشر على المتجر عطّله واستخدم HTTPS فقط.

## تثبيت الحزم

```bash
npm install
```

## بناء الويب ثم مزامنة Capacitor

```bash
npm run build
npm run cap:sync
```

## فتح مشروع أندرويد (Samsung وغيره)

```bash
npm run cap:open:android
```

ثم Build من Android Studio (APK أو AAB).

## فتح مشروع iOS (يتطلب macOS + Xcode)

```bash
npm run cap:open:ios
```

ثم Archive من Xcode. **لا يمكن بناء iOS من ويندوز**؛ تحتاج جهاز Mac أو CI يبني iOS.

## ملاحظات CORS

في وضع غير الإنتاج، الخادم يقبل أيضاً أصولاً من عناوين `192.168.x.x` و`10.x` و`172.16–31` لتسهيل التطوير من هاتف على نفس الشبكة.

## React Native (Expo) — بديل Capacitor

يوجد مجلد **`mobile/`** بتطبيق Expo (آيفون + أندرويد) يبدأ بجلسة API وتبويبات مطابقة للويب كعناوين للترحيل التدريجي. التشغيل والإعداد: راجع **`mobile/README.md`**. عنوان الـ API للتطبيق الأصلي: **`EXPO_PUBLIC_API_URL`** في `mobile/.env`.
