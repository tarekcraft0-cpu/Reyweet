import { useState } from "react";
import { useApp, userById } from "@/lib/store";
import { notifyGuestActionBlocked } from "@/lib/guestBlocked";
import type { Post } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Link2, StickyNote } from "lucide-react";

export type ShareTarget =
  | { kind: "post"; post: Post }
  | { kind: "story"; storyId: string };

interface Props {
  target: ShareTarget;
  onClose: () => void;
}

function buildShareUrl(target: ShareTarget) {
  const base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
  if (target.kind === "post") return `${base}?post=${encodeURIComponent(target.post.id)}`;
  return `${base}?story=${encodeURIComponent(target.storyId)}`;
}

export function ShareSheet({ target, onClose }: Props) {
  const { state, currentUser, openOrCreateChat, sendMessage, addMediaNote, isGuest } = useApp();
  const me = currentUser!;
  const friends = me.following.map(id => userById(state, id)).filter(Boolean);
  const [noteMode, setNoteMode] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [shareComment, setShareComment] = useState("");

  const previewLabel =
    target.kind === "post"
      ? (target.post.type === "reel" ? "ريلز" : "منشور")
      : "ستوري";

  const sendToFriend = (otherId: string) => {
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    const chat = openOrCreateChat(otherId);
    if (!chat) {
      if (isGuest) notifyGuestActionBlocked();
      else window.alert("تعذّر فتح المحادثة.");
      return;
    }
    if (target.kind === "post") {
      const note = shareComment.trim();
      sendMessage(chat.id, {
        type: "shared_post",
        content: target.post.id,
        ...(note ? { shareText: note } : {}),
      });
    } else {
      const note = shareComment.trim();
      sendMessage(chat.id, {
        type: "shared_story",
        content: target.storyId,
        ...(note ? { shareText: note } : {}),
      });
    }
    setShareComment("");
    onClose();
  };

  const copyLink = async () => {
    const url = buildShareUrl(target);
    try {
      await navigator.clipboard.writeText(url);
      alert("تم نسخ الرابط");
    } catch {
      alert(url);
    }
  };

  const submitNote = () => {
    if (isGuest) {
      notifyGuestActionBlocked();
      return;
    }
    if (!noteText.trim()) return;
    if (target.kind === "post") {
      addMediaNote("post", target.post.id, noteText);
    } else {
      addMediaNote("story", target.storyId, noteText);
    }
    setNoteText("");
    setNoteMode(false);
    alert("تم إرسال النوت");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-background w-full rounded-t-3xl p-4 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4" />
        <h3 className="font-semibold mb-3 text-center">مشاركة {previewLabel}</h3>

        <div className="flex gap-2 mb-4">
          <button type="button" onClick={copyLink} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary font-medium text-sm">
            <Link2 size={18} />
            نسخ الرابط
          </button>
          <button
            type="button"
            onClick={() => setNoteMode(n => !n)}
            className={"flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-medium text-sm " + (noteMode ? "bg-primary text-primary-foreground" : "bg-secondary")}
          >
            <StickyNote size={18} />
            نوت
          </button>
        </div>

        {noteMode && (
          <div className="mb-4 space-y-2">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="اكتب نوتك (يظهر لأصدقائك عند مشاهدة المحتوى)"
              maxLength={80}
              rows={2}
              className="w-full bg-input rounded-2xl px-3 py-2 text-sm outline-none resize-none"
            />
            <button type="button" onClick={submitNote} className="w-full bg-primary text-primary-foreground py-2 rounded-2xl font-semibold text-sm">
              إرسال النوت
            </button>
          </div>
        )}

        <div className="mb-4 space-y-2">
          <textarea
            value={shareComment}
            onChange={e => setShareComment(e.target.value)}
            placeholder="اكتب تعليق للمشاركة (اختياري)"
            maxLength={100}
            rows={2}
            className="w-full bg-input rounded-2xl px-3 py-2 text-sm outline-none resize-none"
          />
        </div>

        <h4 className="text-xs text-muted-foreground mb-2 px-1">إرسال إلى</h4>
        {friends.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">تابع أصدقاء أولاً</p>}
        <div className="grid grid-cols-4 gap-3">
          {friends.map(u => u && (
            <button key={u.id} type="button" onClick={() => sendToFriend(u.id)} className="flex flex-col items-center gap-1">
              <Avatar name={u.username} src={u.avatar} size={56} />
              <span className="text-xs truncate w-full text-center">{u.username}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
