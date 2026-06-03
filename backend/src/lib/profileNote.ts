/** نوت البروفايل — 24 ساعة (مشارَك مع src/lib/profileNote.ts) */
export const PROFILE_NOTE_TTL_MS = 24 * 60 * 60 * 1000;

export type ProfileNoteRow = {
  note?: string;
  noteAt?: number;
};

export function isProfileNoteActive(u: ProfileNoteRow): boolean {
  const text = u.note?.trim();
  if (!text) return false;
  const at = u.noteAt;
  if (at == null || !Number.isFinite(at) || at <= 0) return false;
  return Date.now() - at < PROFILE_NOTE_TTL_MS;
}

export function resolvedProfileNote(u: ProfileNoteRow): { note: string; noteAt?: number } {
  if (!isProfileNoteActive(u)) return { note: "", noteAt: undefined };
  return { note: u.note!.trim(), noteAt: u.noteAt };
}
