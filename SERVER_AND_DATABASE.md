# خادم Retweet + قاعدة بيانات PostgreSQL

تم إعداد **خادم HTTP** (Hono) مع **Prisma ORM** ومخطط **علائقي** يغطي المستخدمين، المتابعة، المنشورات، التعليقات، الستوريات، المحادثات، الرسائل، الإشعارات، الملصقات، والنوتات الإعلامية.  
العميل الحالي (`src/lib/store.tsx`) ما زال يعمل **محلياً**؛ ربط الواجهة بالـ API يتم في مرحلة لاحقة عبر `VITE_API_URL` وطبقة مزامنة.

## المتطلبات

- Node.js 20+
- Docker (لتشغيل PostgreSQL محلياً) — أو أي Postgres وتوفر `DATABASE_URL`

## 1) تشغيل قاعدة البيانات

من جذر المشروع:

```bash
docker compose up -d
```

ينشئ مستخدم قاعدة البيانات `retweet` وكلمة المرور `retweet` وقاعدة `retweet` على المنفذ `5432` (انظر `docker-compose.yml`).

## 2) ملف البيئة

انسخ `.env.example` إلى `.env` وعدّل القيم إن لزم:

- `DATABASE_URL` — يجب أن يطابق Postgres (مثال جاهز للـ Docker في الملف).
- `JWT_SECRET` — **إلزامي في الإنتاج**: سلسلة عشوائية طويلة (16 حرفاً على الأقل).
- `PORT` — منفذ الخادم (افتراضي `8788`).
- `BCRYPT_ROUNDS` — اختياري (10–14).

## 3) إنشاء الجداول وتوليد Prisma Client

```bash
npm install
npm run db:generate
npm run db:push
```

- `db:push` يزامن المخطط مع قاعدة البيانات دون ملفات ترحيل (مناسب للتطوير).  
- للإنتاج يُفضّل لاحقاً: `npm run db:migrate` مع ترحيلات Prisma.

## 4) بيانات تجريبية (اختياري)

```bash
npm run db:seed
```

ينشئ مستخدمين تجريبيين:

- `sara_demo` / البريد `sara@demo.retweet`
- `omar_demo` / البريد `omar@demo.retweet`  
كلمة المرور لكليهما: **`12345678`**

## 5) تشغيل الخادم

```bash
npm run api:dev
```

الخادم يستمع على **جميع الواجهات** (`0.0.0.0`) ويطبع عناوين `http://<IP>:8788` عند التشغيل. استخدم أحدها في `.env` للعميل (`VITE_API_URL` / `VITE_API_URL_MOBILE`) وفي تطبيق Expo (`EXPO_PUBLIC_API_URL`).

### نقاط النهاية

| الطريقة | المسار | الوصف |
|--------|--------|--------|
| GET | `/health` | فحص الحياة |
| POST | `/auth/register` | جسم JSON: `{ "email", "username", "password" }` — يعيد `{ token, user }` |
| POST | `/auth/login` | جسم JSON: `{ "identifier", "password" }` — `identifier` يمكن أن يكون إيميلاً أو يوزراً |
| GET | `/v1/app-state` | رأس `Authorization: Bearer <token>` — يعيد `{ state }` بصيغة قريبة من `AppState` في العميل (كلمات مرور المستخدمين الفارغة دائماً في الاستجابة) |

### CORS

مفعّل لـ `localhost` و`capacitor://` ولعناوين LAN في وضع التطوير؛ راجع `api/server.ts` عند النشر.

## 6) الخطوة التالية (ربط العميل)

1. إضافة `VITE_API_URL=http://<IPv4-الكمبيوتر>:8788` و`VITE_API_URL_MOBILE` بنفس القيمة في `.env` للواجهة (انظر `.env.example`).
2. بعد تسجيل الدخول عبر الخادم، حفظ `token` (مثلاً `localStorage`) واستدعاء `GET /v1/app-state` لاستبدال الحالة المحلية أو دمجها مع `store`.
3. نقل عمليات الكتابة (منشور، رسالة، متابعة…) إلى مسارات REST إضافية تدريجياً.

## ملاحظات أمان

- كلمات المرور تُخزّن بـ **bcrypt** على الخادم فقط.
- **JWT** للجلسات؛ لا ترسل `JWT_SECRET` للعميل.
- في الإنتاج: HTTPS، تقييد معدل الطلبات، ومراجعة سياسات CORS.

## Supabase (اختياري — قديم)

ما زال بإمكانك استخدام `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` مع `supabase/schema.sql` لمزامنة JSON كما في `src/lib/cloud.ts` — هذا **منفصل** عن خادم Prisma الجديد ويمكن إيقافه عند اكتمال الانتقال للـ API.
