import type { Message } from "./types";

/** رسائل نظام عضوية المجموعة (إضافة / طرد / كتم) — عربي أو إنجليزي */

const AR_ADD_ONE =
  /^@?([A-Za-z0-9_.-]+)\s+أضاف\s+@?([A-Za-z0-9_.-]+)\s+إلى المجموعة$/;
const AR_ADD_MANY =
  /^@?([A-Za-z0-9_.-]+)\s+أضاف\s+(.+)\s+إلى المجموعة$/;
const AR_KICK =
  /^@?([A-Za-z0-9_.-]+)\s+طرد\s+@?([A-Za-z0-9_.-]+)\s+من المجموعة$/;
const AR_MUTE =
  /^@?([A-Za-z0-9_.-]+)\s+كتم\s+@?([A-Za-z0-9_.-]+)(?:\s+لمدة\s+(.+))?$/;
const AR_UNMUTE =
  /^@?([A-Za-z0-9_.-]+)\s+ألغى كتم\s+@?([A-Za-z0-9_.-]+)$/;
const EN_ADD_ONE =
  /^@?([A-Za-z0-9_.-]+)\s+added\s+@?([A-Za-z0-9_.-]+)(?:\s+to\s+the\s+group)?$/i;
const EN_ADD_MANY =
  /^@?([A-Za-z0-9_.-]+)\s+added\s+(.+?)(?:\s+to\s+the\s+group)?$/i;
const EN_KICK =
  /^@?([A-Za-z0-9_.-]+)\s+removed\s+@?([A-Za-z0-9_.-]+)(?:\s+from\s+the\s+group)?$/i;
const EN_MUTE =
  /^@?([A-Za-z0-9_.-]+)\s+muted\s+@?([A-Za-z0-9_.-]+)(?:\s+for\s+(.+))?$/i;
const EN_UNMUTE =
  /^@?([A-Za-z0-9_.-]+)\s+unmuted\s+@?([A-Za-z0-9_.-]+)$/i;

export type GroupSystemEvent = {
  actor: string;
  action: string;
  targets: string[];
};

function bareUsername(u: string): string {
  return (u || "").trim().replace(/^@/, "");
}

function mentionUsername(u: string, lang: "ar" | "en"): string {
  const bare = bareUsername(u);
  if (!bare) return lang === "en" ? "member" : "عضو";
  return `@${bare}`;
}

/** قائمة مستخدمين: a, b, c and d — أو a، b و c */
export function formatGroupMemberList(usernames: string[], lang: "ar" | "en"): string {
  const mentions = usernames.map(u => mentionUsername(u, lang));
  if (mentions.length === 0) return mentionUsername("", lang);
  if (mentions.length === 1) return mentions[0];
  const conj = lang === "en" ? " and " : " و ";
  if (mentions.length === 2) return `${mentions[0]}${conj}${mentions[1]}`;
  const head = mentions.slice(0, -1).join(", ");
  return `${head}${conj}${mentions[mentions.length - 1]}`;
}

/** أسماء المضافين فقط — بدون من نفّذ الإضافة (الأدمن) */
export function filterGroupAddTargetNames(actorUsername: string, targetUsernames: string[]): string[] {
  const actorKey = bareUsername(actorUsername).toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of targetUsernames) {
    const bare = bareUsername(raw);
    if (!bare) continue;
    const key = bare.toLowerCase();
    if (actorKey && key === actorKey) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(bare);
  }
  return out;
}

export function buildGroupAddSystemContent(
  actorUsername: string,
  targetUsernames: string[],
  lang: "ar" | "en" = "ar",
): string {
  const actor = mentionUsername(actorUsername || (lang === "en" ? "admin" : "مشرف"), lang);
  const targets = filterGroupAddTargetNames(actorUsername, targetUsernames);
  if (targets.length === 0) return "";
  const list = formatGroupMemberList(targets, lang);
  if (lang === "en") {
    return `${actor} added ${list}`;
  }
  return `${actor} أضاف ${list} إلى المجموعة`;
}

function parseMemberList(raw: string, lang: "ar" | "en"): string[] {
  let s = (raw || "").trim();
  if (!s) return [];
  const parts: string[] = [];
  const segments = s.split(/,\s*|،\s*/);
  for (let i = 0; i < segments.length; i++) {
    let seg = segments[i].trim();
    if (i === segments.length - 1) {
      const andParts = seg.split(/\s+and\s+|\s+و\s+/i);
      if (andParts.length > 1) {
        for (const p of andParts) parts.push(bareUsername(p));
        continue;
      }
    }
    parts.push(bareUsername(seg));
  }
  return parts.filter(Boolean);
}

export function buildGroupKickSystemContent(actorUsername: string, targetUsername: string): string {
  const actor = actorUsername.startsWith("@") ? actorUsername : `@${actorUsername}`;
  const target = targetUsername.startsWith("@") ? targetUsername : `@${targetUsername}`;
  return `${actor} طرد ${target} من المجموعة`;
}

export function buildGroupMuteSystemContent(
  actorUsername: string,
  targetUsername: string,
  durationLabel: string,
): string {
  const actor = actorUsername.startsWith("@") ? actorUsername : `@${actorUsername}`;
  const target = targetUsername.startsWith("@") ? targetUsername : `@${targetUsername}`;
  return `${actor} كتم ${target} لمدة ${durationLabel}`;
}

export function buildGroupUnmuteSystemContent(
  actorUsername: string,
  targetUsername: string,
): string {
  const actor = actorUsername.startsWith("@") ? actorUsername : `@${actorUsername}`;
  const target = targetUsername.startsWith("@") ? targetUsername : `@${targetUsername}`;
  return `${actor} ألغى كتم ${target}`;
}

export function isGroupMembershipSystemContent(content: string): boolean {
  const text = (content || "").trim();
  return (
    AR_ADD_ONE.test(text) ||
    AR_ADD_MANY.test(text) ||
    AR_KICK.test(text) ||
    AR_MUTE.test(text) ||
    AR_UNMUTE.test(text) ||
    EN_ADD_ONE.test(text) ||
    EN_ADD_MANY.test(text) ||
    EN_KICK.test(text) ||
    EN_MUTE.test(text) ||
    EN_UNMUTE.test(text)
  );
}

/** إزالة تكرار رسائل نظام المجموعة (محلي + خادم) — نُبقي الأحدث لكل نص */
export function dedupeGroupSystemMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  const out: Message[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.type !== "text" || !isGroupMembershipSystemContent(m.content)) {
      out.unshift(m);
      continue;
    }
    const key = m.content.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.unshift(m);
  }
  return out;
}

export function parseGroupSystemEvent(raw: string): GroupSystemEvent | null {
  const text = (raw || "").trim();
  let m = text.match(AR_ADD_ONE);
  if (m) return { actor: m[1], action: "أضاف", targets: [m[2]] };
  m = text.match(AR_ADD_MANY);
  if (m) {
    const actor = bareUsername(m[1]);
    const targets = filterGroupAddTargetNames(actor, parseMemberList(m[2], "ar"));
    if (targets.length > 0) return { actor, action: "أضاف", targets };
  }
  m = text.match(AR_KICK);
  if (m) return { actor: m[1], action: "طرد", targets: [m[2]] };
  m = text.match(AR_MUTE);
  if (m) return { actor: m[1], action: m[3] ? `كتم · ${m[3]}` : "كتم", targets: [m[2]] };
  m = text.match(AR_UNMUTE);
  if (m) return { actor: m[1], action: "ألغى كتم", targets: [m[2]] };
  m = text.match(EN_ADD_ONE);
  if (m) return { actor: m[1], action: "added", targets: [m[2]] };
  m = text.match(EN_ADD_MANY);
  if (m) {
    const actor = bareUsername(m[1]);
    const targets = filterGroupAddTargetNames(actor, parseMemberList(m[2], "en"));
    if (targets.length > 0) return { actor, action: "added", targets };
  }
  m = text.match(EN_KICK);
  if (m) return { actor: m[1], action: "removed", targets: [m[2]] };
  m = text.match(EN_MUTE);
  if (m) return { actor: m[1], action: m[3] ? `muted · ${m[3]}` : "muted", targets: [m[2]] };
  m = text.match(EN_UNMUTE);
  if (m) return { actor: m[1], action: "unmuted", targets: [m[2]] };
  return null;
}
