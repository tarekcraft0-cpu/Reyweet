/** رسائل نظام المجموعة — يجب أن تطابق src/lib/groupSystemMessages.ts */

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
