/** وضع صيانة — الخادم معطّل مؤقتاً حتى إعادة التفعيل */
export default function handler(_req, res) {
  res.status(503);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(
    JSON.stringify({
      ok: false,
      maintenance: true,
      message: "الخادم معطّل مؤقتاً — سيعود قريباً",
    }),
  );
}
