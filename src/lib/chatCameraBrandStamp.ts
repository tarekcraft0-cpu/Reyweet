import logoUrl from "@/assets/logo.png";

/** عرض الشعار كنسبة من عرض الصورة — أوضح في فقاعة المحادثة */
const LOGO_WIDTH_RATIO = 0.16;
const LOGO_MARGIN_RATIO = 0.035;

let logoPromise: Promise<HTMLImageElement> | null = null;

function loadLogo(): Promise<HTMLImageElement> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("logo load failed"));
      img.src = logoUrl;
    });
  }
  return logoPromise;
}

function loadPhoto(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("photo load failed"));
    img.src = dataUrl;
  });
}

/** يحرق شعار التطبيق على صورة الكاميرا قبل إرسالها للمحادثة */
export async function stampChatCameraImage(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  try {
    const [photo, logo] = await Promise.all([loadPhoto(dataUrl), loadLogo()]);
    const w = photo.width;
    const h = photo.height;
    if (!w || !h) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;

    ctx.drawImage(photo, 0, 0, w, h);

    const logoW = Math.max(48, Math.round(w * LOGO_WIDTH_RATIO));
    const logoH = Math.max(
      1,
      Math.round((logo.height / Math.max(logo.width, 1)) * logoW),
    );
    const pad = Math.max(10, Math.round(w * LOGO_MARGIN_RATIO));
    const x = w - logoW - pad;
    const y = h - logoH - pad;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(logo, x, y, logoW, logoH);
    ctx.restore();

    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return dataUrl;
  }
}
