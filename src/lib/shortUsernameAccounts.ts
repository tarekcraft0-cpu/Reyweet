import type { ID } from "./types";

import { FOUNDER_ACCOUNT_ID } from "./founderAccount";



function envUserId(key: string): string | undefined {

  const v =

    (typeof import.meta !== "undefined" &&

      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key]) ||

    "";

  const t = String(v).trim();

  return t || undefined;

}



/** حسابات مسموح لها باسم مستخدم أقصر من 3 أحرف (userId → الاسم بالضبط) */

export const SHORT_USERNAME_BY_USER_ID: Record<string, string> = {

  [FOUNDER_ACCOUNT_ID]: "t",

  "5d658fe5-bd19-4b4d-be92-a1e0e755215b": "7",

  "65b49544-03f5-46dc-8697-eb08c4cc9fcd": "l",

  /** @1 — tanariqe+1@gmail.com */

  "863b808b-0c26-4d9f-b1c5-b9b586e31d44": "1",

  /** @m — docbcgun469@gmail.com */

  "beb31b7a-1aa8-4268-b299-35aaf1d0de5f": "m",

  ...(envUserId("VITE_SHORT_USER_1_ID") ? { [envUserId("VITE_SHORT_USER_1_ID")!]: "1" } : {}),

  ...(envUserId("VITE_SHORT_USER_M_ID") ? { [envUserId("VITE_SHORT_USER_M_ID")!]: "m" } : {}),

};



/** أسماء محجوزة — لا يمكن لغير صاحب الحساب استخدامها */

export const RESERVED_SHORT_USERNAMES = new Set(

  Object.values(SHORT_USERNAME_BY_USER_ID).map(s => s.toLowerCase()),

);



/** يمكنها رفع صورة شخصية (وليس الحروف الأولى فقط) — مثل @t و @7 و @l و @1 و @m */

export const PRIVILEGED_AVATAR_USER_IDS = new Set<string>([

  ...Object.keys(SHORT_USERNAME_BY_USER_ID),

]);



export function normalizeUsername(raw: string): string {

  return raw.trim().toLowerCase();

}



export function isShortUsernameException(username: string, userId?: ID): boolean {

  if (!userId) return false;

  const allowed = SHORT_USERNAME_BY_USER_ID[userId];

  return !!allowed && normalizeUsername(username) === allowed;

}



/** هل الاسم محجوز لحساب قصير آخر؟ */

export function isReservedShortUsername(username: string, exceptUserId?: ID): boolean {

  const norm = normalizeUsername(username);

  if (!RESERVED_SHORT_USERNAMES.has(norm)) return false;

  for (const [id, allowed] of Object.entries(SHORT_USERNAME_BY_USER_ID)) {

    if (allowed === norm) return exceptUserId !== id;

  }

  return true;

}



export function getUserIdForReservedShortUsername(username: string): ID | undefined {

  const norm = normalizeUsername(username);

  for (const [id, allowed] of Object.entries(SHORT_USERNAME_BY_USER_ID)) {

    if (allowed === norm) return id;

  }

  return undefined;

}



export function isPrivilegedAvatarUser(userId?: ID): boolean {

  return !!userId && PRIVILEGED_AVATAR_USER_IDS.has(userId);

}



export function isSevenAccount(user: { id: ID; username?: string }): boolean {

  return (

    user.id === "5d658fe5-bd19-4b4d-be92-a1e0e755215b" ||

    user.username?.trim() === "7"

  );

}


