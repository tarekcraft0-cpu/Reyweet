import type { AppState } from "./types";
import { isVideoMediaRef } from "./postMedia";
import { isRenderableMediaUrl, resolveMediaUrl } from "./mediaUrl";

export type GalleryMediaKind = "image" | "video";

export type GalleryRecord = {
  id: string;
  kind: GalleryMediaKind;
  mime: string;
  album: string;
  favorite: boolean;
  createdAt: number;
  name: string;
  /** مصدر داخل التطبيق (منشور) — لا يُخزَّن في IndexedDB */
  remoteUrl?: string;
};

export type GalleryTile = GalleryRecord & {
  previewUrl: string;
};

const DB_NAME = "retweet-story-gallery-v1";
const DB_VER = 1;
const META = "meta";
const BLOBS = "blobs";
const THUMBS = "thumbs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      if (!db.objectStoreNames.contains(THUMBS)) db.createObjectStore(THUMBS);
    };
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  if (store === META) os.put(value);
  else os.put(value, key);
  await txDone(tx);
}

async function idbDelete(store: string, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

async function listMeta(): Promise<GalleryRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META, "readonly");
    const req = tx.objectStore(META).getAll();
    req.onsuccess = () => {
      const rows = (req.result as GalleryRecord[]) || [];
      resolve(rows.sort((a, b) => b.createdAt - a.createdAt));
    };
    req.onerror = () => reject(req.error);
  });
}

function guessAlbum(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (rel && rel.includes("/")) {
    const parts = rel.split("/");
    if (parts.length >= 2) return parts[parts.length - 2] || "Recents";
  }
  const n = file.name.toLowerCase();
  if (/whatsapp|wa\d/i.test(n)) return "WhatsApp";
  if (/snap|screenshot/i.test(n)) return "Snapchat";
  if (/insta|ig_/i.test(n)) return "Instagram";
  if (/pinterest|pin_/i.test(n)) return "Pinterest";
  return "Recents";
}

async function imageThumbBlob(file: File, max = 320): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise(resolve => canvas.toBlob(b => resolve(b), "image/jpeg", 0.72));
  } catch {
    return null;
  }
}

async function videoThumbBlob(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("video load"));
    });
    video.currentTime = Math.min(0.5, video.duration || 0.5);
    await new Promise<void>(resolve => {
      video.onseeked = () => resolve();
      window.setTimeout(resolve, 400);
    });
    const max = 320;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return await new Promise(resolve => canvas.toBlob(b => resolve(b), "image/jpeg", 0.72));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importFilesToGallery(files: File[], albumHint?: string): Promise<number> {
  let added = 0;
  for (const file of files) {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
    if (!isVideo && !isImage) continue;

    const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const record: GalleryRecord = {
      id,
      kind: isVideo ? "video" : "image",
      mime: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
      album: albumHint || guessAlbum(file),
      favorite: false,
      createdAt: file.lastModified || Date.now(),
      name: file.name,
    };

    const thumb = isVideo ? await videoThumbBlob(file) : await imageThumbBlob(file);
    await idbPut(META, id, record);
    await idbPut(BLOBS, id, file);
    if (thumb) await idbPut(THUMBS, id, thumb);
    added += 1;
  }
  return added;
}

export async function setGalleryFavorite(id: string, favorite: boolean): Promise<void> {
  const rec = await idbGet<GalleryRecord>(META, id);
  if (!rec || rec.remoteUrl) return;
  await idbPut(META, id, { ...rec, favorite });
}

export async function loadGalleryTiles(): Promise<GalleryTile[]> {
  const meta = await listMeta();
  const tiles: GalleryTile[] = [];
  for (const rec of meta) {
    const thumb = await idbGet<Blob>(THUMBS, rec.id);
    const blob = thumb || (await idbGet<Blob>(BLOBS, rec.id));
    if (!blob) continue;
    tiles.push({
      ...rec,
      previewUrl: URL.createObjectURL(blob),
    });
  }
  return tiles;
}

export async function resolveGalleryDraft(
  item: GalleryTile,
): Promise<{ kind: GalleryMediaKind; dataUrl: string } | null> {
  if (item.remoteUrl) {
    const url = resolveMediaUrl(item.remoteUrl);
    if (!isRenderableMediaUrl(url)) return null;
    return { kind: item.kind, dataUrl: url };
  }
  const blob = await idbGet<Blob>(BLOBS, item.id);
  if (!blob) return null;
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ kind: item.kind, dataUrl: String(r.result) });
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function appMediaTiles(state: AppState, userId: string): GalleryTile[] {
  const out: GalleryTile[] = [];
  const seen = new Set<string>();
  for (const p of state.posts) {
    if (p.userId !== userId) continue;
    const raw = (p.video || p.image || "").trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    const url = resolveMediaUrl(raw);
    if (!isRenderableMediaUrl(url)) continue;
    const kind: GalleryMediaKind = p.video || isVideoMediaRef(raw) ? "video" : "image";
    out.push({
      id: `app_${p.id}`,
      kind,
      mime: kind === "video" ? "video/mp4" : "image/jpeg",
      album: "Recents",
      favorite: false,
      createdAt: p.createdAt || Date.now(),
      name: p.id,
      remoteUrl: raw,
      previewUrl: url,
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export type GalleryFilter = "all" | "videos" | "favorites";

export function filterGalleryTiles(tiles: GalleryTile[], filter: GalleryFilter): GalleryTile[] {
  if (filter === "videos") return tiles.filter(t => t.kind === "video");
  if (filter === "favorites") return tiles.filter(t => t.favorite);
  return tiles;
}

export type AlbumSummary = { name: string; count: number; coverUrl: string };

export function summarizeAlbums(tiles: GalleryTile[]): AlbumSummary[] {
  const map = new Map<string, GalleryTile[]>();
  for (const t of tiles) {
    const list = map.get(t.album) || [];
    list.push(t);
    map.set(t.album, list);
  }
  return [...map.entries()]
    .map(([name, items]) => ({
      name,
      count: items.length,
      coverUrl: items[0]?.previewUrl || "",
    }))
    .sort((a, b) => {
      if (a.name === "Recents") return -1;
      if (b.name === "Recents") return 1;
      return b.count - a.count;
    });
}

export type MediaTypeFilter = "videos" | "selfies" | "panoramas" | "bursts" | "timelapse";

export function filterByMediaType(tiles: GalleryTile[], type: MediaTypeFilter): GalleryTile[] {
  const n = (s: string) => s.toLowerCase();
  return tiles.filter(t => {
    const hay = n(t.name) + n(t.album);
    switch (type) {
      case "videos":
        return t.kind === "video";
      case "selfies":
        return /selfie|front|camera|portrait/i.test(hay);
      case "panoramas":
        return /pano|panorama|360/i.test(hay);
      case "bursts":
        return /burst|brst/i.test(hay);
      case "timelapse":
        return /timelapse|time-lapse|hyperlapse/i.test(hay);
      default:
        return true;
    }
  });
}

export function revokeGalleryTileUrls(tiles: GalleryTile[]) {
  for (const t of tiles) {
    if (t.remoteUrl) continue;
    try {
      URL.revokeObjectURL(t.previewUrl);
    } catch {
      /* ignore */
    }
  }
}
