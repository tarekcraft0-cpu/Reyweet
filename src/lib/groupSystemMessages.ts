import type { Message } from "./types";

/** رسائل نظام عضوية المجموعة (إضافة / طرد / كتم) — عربي أو إنجليزي */

const AR_ADD =
  /^@?([A-Za-z0-9_.-]+)\s+أضاف\s+@?([A-Za-z0-9_.-]+)\s+إلى المجموعة$/;
const AR_KICK =
  /^@?([A-Za-z0-9_.-]+)\s+طرد\s+@?([A-Za-z0-9_.-]+)\s+من المجموعة$/;
const AR_MUTE =
  /^@?([A-Za-z0-9_.-]+)\s+كتم\s+@?([A-Za-z0-9_.-]+)(?:\s+لمدة\s+(.+))?$/;
const AR_UNMUTE =
  /^@?([A-Za-z0-9_.-]+)\s+ألغى كتم\s+@?([A-Za-z0-9_.-]+)$/;
const EN_ADD =
  /^@?([A-Za-z0-9_.-]+)\s+added\s+@?([A-Za-z0-9_.-]+)(?:\s+to\s+the\s+group)?$/i;
const EN_KICK =
  /^@?([A-Za-z0-9_.-]+)\s+removed\s+@?([A-Za-z0-9_.-]+)(?:\s+from\s+the\s+group)?$/i;
const EN_MUTE =
  /^@?([A-Za-z0-9_.-]+)\s+muted\s+@?([A-Za-z0-9_.-]+)(?:\s+for\s+(.+))?$/i;
const EN_UNMUTE =
  /^@?([A-Za-z0-9_.-]+)\s+unmuted\s+@?([A-Za-z0-9_.-]+)$/i;

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
    AR_ADD.test(text) ||
    AR_KICK.test(text) ||
    AR_MUTE.test(text) ||
    AR_UNMUTE.test(text) ||
    EN_ADD.test(text) ||
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

export function parseGroupSystemEvent(
  raw: string,
): { actor: string; action: string; target: string } | null {
  const text = (raw || "").trim();
  let m = text.match(AR_ADD);
  if (m) return { actor: m[1], action: "أضاف", target: m[2] };
  m = text.match(AR_KICK);
  if (m) return { actor: m[1], action: "طرد", target: m[2] };
  m = text.match(AR_MUTE);
  if (m) return { actor: m[1], action: m[3] ? `كتم · ${m[3]}` : "كتم", target: m[2] };
  m = text.match(AR_UNMUTE);
  if (m) return { actor: m[1], action: "ألغى كتم", target: m[2] };
  m = text.match(EN_ADD);
  if (m) return { actor: m[1], action: "added", target: m[2] };
  m = text.match(EN_KICK);
  if (m) return { actor: m[1], action: "removed", target: m[2] };
  m = text.match(EN_MUTE);
  if (m) return { actor: m[1], action: m[3] ? `muted · ${m[3]}` : "muted", target: m[2] };
  m = text.match(EN_UNMUTE);
  if (m) return { actor: m[1], action: "unmuted", target: m[2] };
  return null;
}
