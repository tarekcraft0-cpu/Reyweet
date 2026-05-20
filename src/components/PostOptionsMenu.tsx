import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { Post } from "@/lib/types";

export function PostOptionsMenu({
  post,
  onClose,
  onDeleted,
}: {
  post: Post;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { currentUser, deletePost } = useApp();
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const isOwner = currentUser?.id === post.userId;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!isOwner) return null;

  return (
    <div
      ref={panelRef}
      dir="rtl"
      className="absolute end-2 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-border bg-popover py-1 text-sm shadow-lg"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full flex-row items-center gap-2 px-4 py-2.5 text-start text-destructive hover:bg-destructive/10"
        onClick={() => {
          const label =
            post.type === "tweet" ? "حذف هذه التغريدة؟" : post.type === "reel" ? "حذف هذا الريل؟" : "حذف هذا المنشور؟";
          if (!window.confirm(label)) return;
          deletePost(post.id);
          onDeleted?.();
          onClose();
        }}
      >
        <Trash2 size={18} className="shrink-0" />
        {t("delete")}
      </button>
    </div>
  );
}

export function CommentOptionsMenu({
  postId,
  commentId,
  authorId,
  onClose,
}: {
  postId: string;
  commentId: string;
  authorId: string;
  onClose: () => void;
}) {
  const { currentUser, deleteComment } = useApp();
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const isOwner = currentUser?.id === authorId;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!isOwner) return null;

  return (
    <div
      ref={panelRef}
      dir="rtl"
      className="absolute end-0 top-full z-50 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-border bg-popover py-1 text-sm shadow-lg"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full flex-row items-center gap-2 px-3 py-2 text-start text-destructive hover:bg-destructive/10"
        onClick={() => {
          if (!window.confirm("حذف هذا التعليق؟")) return;
          deleteComment(postId, commentId);
          onClose();
        }}
      >
        <Trash2 size={16} className="shrink-0" />
        {t("delete")}
      </button>
    </div>
  );
}
