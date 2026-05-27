import { useApp, userById } from "@/lib/store";
import type { Message } from "@/lib/types";
import { openStoryViewer } from "@/lib/storyChrome";
import { normalizeStoryMedia } from "@/lib/storyMedia";
import { Avatar } from "../Avatar";

function parseLegacyNoteReply(content: string): { noteText: string; reply: string } | null {
  const m = content.match(/^↩️ رد على نوتك:\n«([\s\S]*?)»\n—\n([\s\S]*)$/);
  if (!m) return null;
  return { noteText: m[1]!, reply: m[2]! };
}

export function ChatNoteReplyBubble({ message, mine }: { message: Message; mine: boolean }) {
  const ctx = message.replyContext?.kind === "note" ? message.replyContext : null;
  const legacy = !ctx ? parseLegacyNoteReply(message.content) : null;
  const noteText = ctx?.noteText ?? legacy?.noteText;
  const replyText = ctx ? message.content : legacy?.reply ?? message.content;
  if (!noteText) return null;

  return (
    <div className="flex w-fit max-w-[75%] min-w-0 flex-col gap-2">
      <div
        className={
          "rounded-2xl border px-3 py-2 text-start text-xs " +
          (mine ? "border-white/20 bg-white/10" : "border-border bg-muted/50")
        }
      >
        <p className="mb-1 font-semibold opacity-80">نوتك</p>
        <p className="whitespace-pre-wrap leading-relaxed">{noteText}</p>
      </div>
      <p dir="auto" className="select-none whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {replyText}
      </p>
    </div>
  );
}

export function ChatStoryReplyStack({
  message,
  shareText,
}: {
  message: Message;
  shareText?: string;
}) {
  const { state } = useApp();
  const storyId = message.replyContext?.kind === "story" ? message.replyContext.storyId : message.content;
  const story = state.stories.find(s => s.id === storyId);
  const author = story ? userById(state, story.userId) : null;

  if (!story || !author) {
    return shareText ? <span className="select-none text-sm">{shareText}</span> : null;
  }

  return (
    <div className="flex w-full max-w-[min(96vw,360px)] flex-col gap-2">
      <button
        type="button"
        className="overflow-hidden rounded-2xl border border-border/80 bg-muted/40 text-start shadow-sm active:scale-[0.99]"
        onClick={e => {
          e.stopPropagation();
          openStoryViewer(story.userId, story.id);
        }}
      >
        <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5">
          <Avatar name={author.username} src={author.avatar} size={24} />
          <span className="text-xs font-semibold">@{author.username}</span>
          <span className="ms-auto text-[10px] text-muted-foreground">ستوري · اضغط للفتح</span>
        </div>
        <div className="relative aspect-[9/14] max-h-44 w-full bg-black">
          {(() => {
            const sm = normalizeStoryMedia(story);
            if (sm.hasVideo) {
              return (
                <video
                  src={sm.videoUrl}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              );
            }
            if (sm.hasImage) {
              return <img src={sm.imageUrl} alt="" className="h-full w-full object-cover" />;
            }
            return (
              <div className="flex h-full w-full items-center justify-center text-4xl">
                {sm.emojiFallback || "📷"}
              </div>
            );
          })()}
        </div>
      </button>
      {shareText && (
        <p dir="auto" className="whitespace-pre-wrap px-0.5 text-sm leading-relaxed">
          {shareText}
        </p>
      )}
    </div>
  );
}
