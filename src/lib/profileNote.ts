/** مدة نوت البروفايل (شريط المحادثات) — 24 ساعة */
export const PROFILE_NOTE_TTL_MS = 24 * 60 * 60 * 1000;

export type ProfileNoteFields = {
  note?: string;
  noteAt?: number;
};

export function isProfileNoteActive(u: ProfileNoteFields): boolean {
  const text = u.note?.trim();
  if (!text) return false;
  const at = u.noteAt;
  if (at == null || !Number.isFinite(at) || at <= 0) return false;
  return Date.now() - at < PROFILE_NOTE_TTL_MS;
}

/** نص النوت الفعّال للعرض — فارغ بعد انتهاء المدة */
export function resolvedProfileNote(u: ProfileNoteFields): { note: string; noteAt?: number } {
  if (!isProfileNoteActive(u)) return { note: "", noteAt: undefined };
  return { note: u.note!.trim(), noteAt: u.noteAt };
}
