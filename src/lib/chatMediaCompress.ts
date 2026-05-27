const MAX_IMAGE_EDGE = 1280;
const IMAGE_JPEG_QUALITY = 0.82;
const MAX_VIDEO_EDGE = 720;
const VIDEO_BITRATE = 900_000;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

export async function compressChatImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 180_000) return file;
  try {
    const img = await loadImageFromFile(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height, 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(b => resolve(b), "image/jpeg", IMAGE_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size * 0.92) return file;
    const name = (file.name.replace(/\.[^.]+$/, "") || "photo") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export async function compressChatVideoFile(file: File): Promise<File> {
  if (!file.type.startsWith("video/") || file.size < 800_000) return file;
  if (typeof document === "undefined") return file;
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video meta failed"));
      video.src = url;
    });
    const duration = Math.min(Math.max(video.duration || 0, 0.1), 120);
    const scale = Math.min(1, MAX_VIDEO_EDGE / Math.max(video.videoWidth, video.videoHeight, 1));
    const w = Math.max(2, Math.round(video.videoWidth * scale));
    const h = Math.max(2, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return file;
    }
    const stream = canvas.captureStream(24);
    const mime =
      MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "";
    if (!mime) {
      URL.revokeObjectURL(url);
      return file;
    }
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITRATE });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      recorder.onerror = () => reject(recorder.error ?? new Error("record failed"));
    });
    recorder.start(200);
    video.currentTime = 0;
    await video.play().catch(() => undefined);
    const start = performance.now();
    await new Promise<void>(resolve => {
      const tick = () => {
        if (video.ended || video.currentTime >= duration - 0.05) {
          resolve();
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        if (performance.now() - start > duration * 1000 + 400) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    video.pause();
    recorder.stop();
    const out = await done;
    URL.revokeObjectURL(url);
    if (!out.size || out.size >= file.size * 0.9) return file;
    const ext = mime.includes("webm") ? "webm" : "mp4";
    return new File([out], (file.name.replace(/\.[^.]+$/, "") || "video") + "." + ext, {
      type: out.type,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export async function compressChatMediaFile(file: File): Promise<File> {
  if (file.type.startsWith("image/")) return compressChatImageFile(file);
  if (file.type.startsWith("video/")) return compressChatVideoFile(file);
  return file;
}
