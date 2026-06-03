import { listUsers, updateUser } from "../db/engine.js";
import { isProfileNoteActive } from "./profileNote.js";

/** يمسح النوتات المنتهية والقديمة بلا noteAt من قاعدة users.json */
export async function purgeExpiredProfileNotes(): Promise<number> {
  const rows = await listUsers();
  let n = 0;
  for (const row of rows) {
    if (!row.note?.trim()) continue;
    if (isProfileNoteActive(row)) continue;
    await updateUser(row.id, { note: "", noteAt: undefined });
    n += 1;
  }
  return n;
}
