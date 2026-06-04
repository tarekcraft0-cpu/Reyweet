/** رسائل نظام المجموعة — يجب أن تطابق src/lib/groupSystemMessages.ts */

function bareUsername(u: string): string {
  return (u || "").trim().replace(/^@/, "");
}

function mentionUsername(u: string, lang: "ar" | "en"): string {
  const bare = bareUsername(u);
  if (!bare) return lang === "en" ? "member" : "عضو";
  return `@${bare}`;
}

export function formatGroupMemberList(usernames: string[], lang: "ar" | "en"): string {
  const mentions = usernames.map(u => mentionUsername(u, lang));
  if (mentions.length === 0) return mentionUsername("", lang);
  if (mentions.length === 1) return mentions[0];
  const conj = lang === "en" ? " and " : " و ";
  if (mentions.length === 2) return `${mentions[0]}${conj}${mentions[1]}`;
  const head = mentions.slice(0, -1).join(", ");
  return `${head}${conj}${mentions[mentions.length - 1]}`;
}

export function buildGroupAddSystemContent(
  actorUsername: string,
  targetUsernames: string[],
  lang: "ar" | "en" = "ar",
): string {
  const actor = mentionUsername(actorUsername || (lang === "en" ? "admin" : "مشرف"), lang);
  const list = formatGroupMemberList(targetUsernames, lang);
  if (lang === "en") {
    return `${actor} added ${list}`;
  }
  return `${actor} أضاف ${list} إلى المجموعة`;
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

export function muteDurationLabelAr(durationMinutes: number | null): string {
  if (durationMinutes == null) return "للأبد";
  if (durationMinutes === 5) return "5 دقائق";
  if (durationMinutes === 10) return "10 دقائق";
  if (durationMinutes === 60) return "ساعة";
  return `${durationMinutes} دقيقة`;
}
