# Retweet: موبايل + قاعدة البيانات المحلية

راجع **`SERVER_AND_DATABASE.md`** للتفاصيل الكاملة.

## ملخص

1. شغّل الخادم: `npm run backend:dev` (من جذر المشروع) أو `npm run dev` داخل `backend/`
2. شغّل الواجهة: `npm run dev`
3. على الهاتف: عيّن `expo.extra.apiUrl` في `mobile/app.json` إلى `http://<IPv4-الكمبيوتر>:3000`

لا حاجة لـ Docker أو Supabase أو PostgreSQL.
