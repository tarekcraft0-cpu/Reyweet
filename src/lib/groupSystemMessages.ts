/** رسائل نظام عضوية المجموعة (إضافة / طرد) — عربي أو إنجليزي */
export function isGroupMembershipSystemContent(content: string): boolean {
  const text = (content || "").trim();
  return (
    /^@?[A-Za-z0-9_.-]+\s+أضاف\s+@?[A-Za-z0-9_.-]+\s+إلى المجموعة$/.test(text) ||
    /^@?[A-Za-z0-9_.-]+\s+طرد\s+@?[A-Za-z0-9_.-]+\s+من المجموعة$/.test(text) ||
    /^@?[A-Za-z0-9_.-]+\s+added\s+@?[A-Za-z0-9_.-]+/i.test(text) ||
    /^@?[A-Za-z0-9_.-]+\s+removed\s+@?[A-Za-z0-9_.-]+/i.test(text)
  );
}
