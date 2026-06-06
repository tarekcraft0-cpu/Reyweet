/** وضع صيانة — الخادم معطّل مؤقتاً حتى إعادة التفعيل */
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Device-Fingerprint, X-Device-Label, X-Retweet-Client",
  );
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  res.statusCode = 503;
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
