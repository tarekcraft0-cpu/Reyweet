import { Avatar } from "./Avatar";
import type { MediaNote } from "@/lib/types";
import type { User } from "@/lib/types";

/** نوت داخل حدود وسائط المنشور (فوق الصورة/الفيديو) */
export function PostMediaNotesOverlay({
  notes,
  noteUsers,
  canReply,
  onReply,
  onOpenAuthor,
}: {
  notes: MediaNote[];
  noteUsers: User[];
  canReply: (note: MediaNote) => boolean;
  onReply: (note: MediaNote) => void;
  onOpenAuthor: (userId: string) => void;
}) {
  if (notes.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto bg-gradient-to-b from-black/55 via-black/25 to-transparent px-2.5 pb-8 pt-2.5">
      {notes.map(n => {
        const nu = noteUsers.find(u => u.id === n.authorId);
        if (!nu) return null;
        return (
          <div key={n.id} className="pointer-events-auto flex max-w-[7.5rem] shrink-0 flex-col items-start gap-1">
            {canReply(n) ? (
              <button
                type="button"
                title="رد على النوت"
                onClick={e => {
                  e.stopPropagation();
                  onReply(n);
                }}
                className="line-clamp-2 w-full rounded-xl border border-white/25 bg-black/45 px-2 py-1 text-start text-[11px] font-medium leading-snug text-white backdrop-blur-sm hover:bg-black/55 active:scale-[0.98]"
              >
                {n.text}
              </button>
            ) : (
              <div className="line-clamp-2 w-full rounded-xl border border-white/25 bg-black/45 px-2 py-1 text-start text-[11px] font-medium leading-snug text-white backdrop-blur-sm">
                {n.text}
              </div>
            )}
            <button
              type="button"
              className="pointer-events-auto"
              onClick={e => {
                e.stopPropagation();
                onOpenAuthor(nu.id);
              }}
            >
              <Avatar name={nu.username} src={nu.avatar} size={26} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
