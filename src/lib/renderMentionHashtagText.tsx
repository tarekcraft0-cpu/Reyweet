import type { ReactNode } from "react";

/**
 * يعرض النص مع تمييز @اسم و#وسم فقط.
 * لا يُقسّم على كل مسافة — ذلك كان يسبب تباعداً غريباً في العربية بين الحروف على بعض المتصفحات.
 */
const MENTION_OR_HASHTAG = /(@\w+)|(#[\w\u0600-\u06FF]+)/g;

export function renderMentionHashtagNodes(
  raw: string,
  opts: {
    renderMention: (username: string, key: string) => ReactNode;
    renderHashtag: (hashtagWithHash: string, key: string) => ReactNode;
  },
): ReactNode[] {
  const text = raw.length > 12000 ? raw.slice(0, 12000) + "…" : raw;
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(MENTION_OR_HASHTAG)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(<span key={`t${k++}`}>{text.slice(last, idx)}</span>);
    const piece = m[0];
    if (piece.startsWith("@")) out.push(opts.renderMention(piece.slice(1), `m${k++}`));
    else out.push(opts.renderHashtag(piece, `h${k++}`));
    last = idx + piece.length;
  }
  if (last < text.length) out.push(<span key={`t${k++}`}>{text.slice(last)}</span>);
  return out;
}
