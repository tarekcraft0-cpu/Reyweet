# Retweet — React Native (Expo)

المشروع على **Expo SDK 54** (React Native **0.81**، React **19**) — متوافق مع **Expo Go** الحالي من App Store.

هذا المجلد تطبيق **منفصل** بـ React Native يعادل تدريجياً مشروع الويب في الجذر (`src/`).

## التشغيل

`mobile/` له **package.json و `node_modules` منفصلان** عن جذر المشروع حتى لا يختلط **Expo SDK 54** مع واجهة الويب في الجذر.

### من جذر المستودع

```bash
npm install          # مرة: واجهة الويب + Prisma + Capacitor + …
npm start            # يشغّل Expo من mobile/ (نفس: npm run start --prefix ./mobile)
```

### من داخل `mobile/` (أول مرة أو بعد تعديل حزم الموبايل)

```bash
cd mobile
npm install
copy .env.example .env
npm run start
```

ثم امسح رمز QR بتطبيق **Expo Go** (أندرويد / آيفون) أو `npm run android` / `npm run ios`.

## عنوان الـ API

ضع نفس خادم Retweet API الذي يشغّله المشروع الرئيسي (`npm run api:dev`):

- في `.env`: `EXPO_PUBLIC_API_URL=http://192.168.1.100:8788` (نفس عنوان الـ API في الجذر؛ غيّر الـ IP ليطابق جهازك).
- أو في `app.json` → `expo.extra.apiUrl` (أقل مرونة من `.env`).

بدون هذا العنوان تظهر شاشة توضيحية تطلب الإعداد.

## ما تم تنفيذه

- Expo Router، نقطة دخول `app/index.tsx` (جلسة → تبويبات أو تسجيل).
- تسجيل دخول / إنشاء حساب / نسيت كلمة المرور عبر الـ API (`lib/apiNative.ts`).
- تبويبات مطابقة للويب كعناوين: الرئيسية، بحث، ريلز، رسائل، أنا (محتوى مؤقت حتى الترحيل).
- نسخة من `AppState` وأنواع البيانات في `lib/types.ts` (زامنها مع `src/lib/types.ts` عند التغيير).

## الترحيل التالي (يدوي)

1. استخراج منطق `store.tsx` إلى وحدات خالصة (بدون DOM) ثم استيرادها هنا أو عبر `packages/shared`.
2. استبدال كل `PlaceholderScreen` بمكوّنات React Native مكافئة لملفات `src/components/screens/*`.
3. الوسائط: `expo-image-picker`, `expo-av` للفيديو، إلخ.
