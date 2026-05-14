import { useState } from "react";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import { useApp, userById } from "@/lib/store";
import type { MediaNote } from "@/lib/types";
import { X } from "lucide-react";

type Props = {
  note: MediaNote | null;
  /** مثل: منشور، تغريدة، ريلز، ستوري */
  contentLabelAr: string;
  onClose: () => void;
  onSent: (chatId: string) => void;
};

export function NoteReplySheet({ note, contentLabelAr, onClose, onSent }: Props) {
  const { state, replyToMediaNoteAsDm, isGuest } = useApp();
  const [text, setText] = useState("");
  if (!note) return null;
  const author = userById(state, note.authorId);

  const send = () => {
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    const res = replyToMediaNoteAsDm({
      noteAuthorId: note.authorId,
      noteText: note.text,
      replyText: trimmed,
      contentLabelAr,
    });
    if (res) {
      setText("");
      onSent(res.chatId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-background rounded-t-3xl p-4 pb-6 shadow-xl border border-border"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">رد على النوت في الخاص</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-secondary" aria-label="إغلاق">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          @{author?.username} — {contentLabelAr}
        </p>
        <div className="text-sm bg-secondary/80 rounded-xl p-3 mb-3 border border-border line-clamp-4">{note.text}</div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="اكتب ردك…"
          rows={3}
          className="w-full bg-input rounded-xl px-3 py-2 text-sm outline-none resize-none mb-3"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm disabled:opacity-50"
        >
          إرسال في الخاص
        </button>
      </div>
    </div>
  );
}
