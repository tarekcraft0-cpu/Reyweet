/** وسائط يمكن عرضها في <img> أو <video> (وليس نصاً خاماً) */
export function isRenderableMediaUrl(s: string | undefined | null): boolean {
  if (!s?.trim()) return false;
  const t = s.trim();
  return (
    t.startsWith("data:") ||
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("blob:")
  );
}
