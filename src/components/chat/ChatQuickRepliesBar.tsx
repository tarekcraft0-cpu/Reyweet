import { loadQuickReplies } from "@/lib/quickReplies";
import { getUserEntitlements } from "@/lib/verificationEntitlements";
import type { User } from "@/lib/types";

export function ChatQuickRepliesBar({
  me,
  onPick,
}: {
  me: User;
  onPick: (text: string) => void;
}) {
  const ent = getUserEntitlements(me);
  if (!ent.hasQuickReplies) return null;
  const items = loadQuickReplies(me.id).slice(0, ent.maxQuickReplies);
  if (!items.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2 border-b border-border/50">
      {items.map(q => (
        <button
          key={q.id}
          type="button"
          onClick={() => onPick(q.text)}
          className="shrink-0 rounded-full border border-border bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground active:scale-95"
        >
          {q.text}
        </button>
      ))}
    </div>
  );
}
