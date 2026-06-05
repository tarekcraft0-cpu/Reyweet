import { Fragment, memo, startTransition } from "react";
import type { MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { parseGroupSystemEvent } from "@/lib/groupSystemMessages";
import { isBannedAccountNoticeMessage } from "@/lib/bannedContentClient";
import { messageContent } from "@/lib/chatNormalize";
import { isOwnChatMessage } from "@/lib/chatViewer";
import { userById } from "@/lib/store";
import type { AppState, Chat, ID, Message } from "@/lib/types";
import { isStickerImageContent, isStickerVideoContent } from "@/lib/stickerUtils";
import { parseDrawingPayload } from "./drawingPayload";
import { ChatSwipeMessageRow } from "./ChatSwipeMessageRow";
import { ChatMessageStatus } from "./ChatMessageStatus";
import {
  type ChatDmPalette,
  type ChatTimelineRow,
  chatBubbleAlignClasses,
  chatDmPeerBubbleStyle,
  chatReactionAlignClasses,
  formatChatBubbleTime,
} from "@/lib/chatDmTheme";

const CHAT_INLINE_MEDIA_COL = "w-full max-w-[min(74vw,274px)] shrink-0";
const CHAT_BUBBLE_MAX_W = "max-w-[min(75vw,280px)]";
const CHAT_TEXT_BUBBLE_COL = "w-max " + CHAT_BUBBLE_MAX_W + " shrink-0";

type ChatVisualTheme = "default" | "blue" | "pink";

function chatMineAccentClass(theme: ChatVisualTheme, isQuran: boolean, igDm = false): string {
  if (igDm) return "bg-[#1B72E8] text-white";
  if (isQuran) return "bg-emerald-700 text-white";
  if (theme === "blue") return "bg-blue-600 text-white dark:bg-blue-500";
  if (theme === "pink") return "bg-pink-600 text-white dark:bg-pink-500";
  return "bg-[#0084ff] text-white";
}

function chatBubbleFilledClass(
  mine: boolean,
  isQuran: boolean,
  theme: ChatVisualTheme = "default",
  igDm = false,
  dmPalette?: ChatDmPalette,
): string {
  const base =
    "chat-message-bubble inline-block w-max max-w-full rounded-[20px] border-0 outline-none ring-0 text-[15px] leading-[1.4] align-top select-text " +
    (igDm ? "px-[15px] py-[10px] " : "px-[14px] py-[10px] ");
  if (isQuran) {
    return (
      base +
      (mine
        ? "bg-emerald-950/90 text-emerald-50 shadow-none"
        : "bg-zinc-800 text-zinc-100 shadow-none")
    );
  }
  if (igDm) {
    if (mine) return base + "bg-white text-black shadow-none";
    return base + "shadow-none";
  }
  if (mine) return base + chatMineAccentClass(theme, false) + " shadow-none";
  return base + "bg-zinc-200 text-zinc-900 dark:bg-[#262626] dark:text-zinc-100";
}

function aggregateReactions(reactions: { emoji: string; userId: string }[]) {
  const map = new Map<string, number>();
  for (const r of reactions) map.set(r.emoji, (map.get(r.emoji) || 0) + 1);
  return Array.from(map.entries());
}

export type ChatRoomMessageListBodyProps = {
  hasOlderMessages: boolean;
  loadingOlderUi: boolean;
  lang: string;
  rowsToRender: ChatTimelineRow[];
  chat: Chat;
  state: AppState;
  meId: ID;
  otherId: ID | null;
  isQuranChannel: boolean;
  useIgDm: boolean;
  dmPalette: ChatDmPalette | null;
  chromeOnWallpaper: boolean;
  theme: ChatVisualTheme;
  vanishMode: boolean;
  isDmRoom: boolean;
  seenFooter: string | null;
  myOutgoing: Message[];
  openMentionProfile: (uname: string) => void;
  onOpenProfile: (userId: ID) => void;
  renderBubbleContent: (m: Message, mine: boolean) => ReactNode;
  onMsgPointerDown: (e: ReactPointerEvent, m: Message) => void;
  onMsgPointerMove: (e: ReactPointerEvent) => void;
  onMsgPointerUp: (e: ReactPointerEvent, m: Message) => void;
  messageElRefs: MutableRefObject<Map<string, HTMLDivElement | null>>;
  onSwipeReply: (m: Message) => void;
};

function ChatRoomMessageListBodyInner(props: ChatRoomMessageListBodyProps) {
  const {
    hasOlderMessages,
    loadingOlderUi,
    lang,
    rowsToRender,
    chat,
    state,
    meId,
    otherId,
    isQuranChannel,
    useIgDm,
    dmPalette,
    chromeOnWallpaper,
    theme,
    vanishMode,
    isDmRoom,
    seenFooter,
    myOutgoing,
    openMentionProfile,
    onOpenProfile,
    renderBubbleContent,
    onMsgPointerDown,
    onMsgPointerMove,
    onMsgPointerUp,
    messageElRefs,
    onSwipeReply,
  } = props;

  return (
    <>
      {(hasOlderMessages || loadingOlderUi) && (
        <div className="flex w-full justify-center py-2" aria-busy={loadingOlderUi}>
          {loadingOlderUi ? (
            <div className="flex gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/30 [animation-delay:240ms]" />
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground opacity-60">
              {lang === "ar" ? "↑ رسائل أقدم" : "↑ Older messages"}
            </span>
          )}
        </div>
      )}
      {rowsToRender.map(row => {
        if (row.kind === "day") {
          return (
            <div key={row.key} data-chat-day={row.key} className="flex w-full justify-center py-2">
              <span
                className="rounded-full px-3 py-1 text-[11px] font-medium"
                style={
                  chromeOnWallpaper
                    ? { backgroundColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.85)" }
                    : dmPalette
                      ? { backgroundColor: dmPalette.dayPillBg, color: dmPalette.dayPillText }
                      : undefined
                }
              >
                {row.label}
              </span>
            </div>
          );
        }
        const m = row.message;
        if (isBannedAccountNoticeMessage(m)) {
          return (
            <div key={m.id} className="flex w-full justify-center px-3 py-3">
              <p
                className={
                  "max-w-[94%] text-center text-[13px] leading-snug font-medium " +
                  (chromeOnWallpaper || dmPalette ? "text-white/85" : "text-muted-foreground")
                }
              >
                {messageContent(m)}
              </p>
            </div>
          );
        }
        const groupSystemEvent =
          (chat.isGroup || chat.isChannel) && m.type === "text"
            ? parseGroupSystemEvent(messageContent(m))
            : null;
        if (groupSystemEvent) {
          const systemMuted =
            chromeOnWallpaper || dmPalette ? "text-white/70" : "text-muted-foreground";
          const systemUserBtn =
            "font-semibold text-primary underline-offset-2 hover:underline active:opacity-80";
          const langEn = state.language === "en";
          const listConj = langEn ? " and " : " و ";
          const isAddEvent =
            groupSystemEvent.action === "أضاف" || groupSystemEvent.action === "added";
          const senderUser = userById(state, m.senderId);
          const actorUsername = (
            isAddEvent && senderUser?.username ? senderUser.username : groupSystemEvent.actor
          ).replace(/^@/, "");
          const targets = (
            isAddEvent
              ? groupSystemEvent.targets.filter(
                  t => t && t.toLowerCase() !== actorUsername.toLowerCase(),
                )
              : groupSystemEvent.targets
          ).filter(Boolean);
          return (
            <div key={m.id} className="flex w-full justify-center px-3 py-3">
              <p
                className={
                  "max-w-[94%] text-center text-[13px] leading-snug font-medium " +
                  (chromeOnWallpaper || dmPalette ? "text-white/90" : "text-foreground/90")
                }
              >
                <button
                  type="button"
                  className={systemUserBtn}
                  onClick={() => openMentionProfile(actorUsername)}
                >
                  @{actorUsername}
                </button>{" "}
                <span className={systemMuted}>{groupSystemEvent.action}</span>{" "}
                {targets.map((target, i) => (
                  <Fragment key={`${target}-${i}`}>
                    {i > 0 ? (
                      <span className={systemMuted}>
                        {i === targets.length - 1 ? listConj : ", "}
                      </span>
                    ) : (
                      " "
                    )}
                    <button
                      type="button"
                      className={systemUserBtn}
                      onClick={() => openMentionProfile(target)}
                    >
                      @{target}
                    </button>
                  </Fragment>
                ))}
              </p>
            </div>
          );
        }
        const showPeerAvatar = row.showPeerAvatar;
        const mine = isOwnChatMessage(m.senderId, state, { directMessagePeerId: otherId });
        const senderProfile = userById(state, m.senderId);
        const mc = messageContent(m);
        const bareSticker = m.type === "sticker" && (isStickerImageContent(mc) || isStickerVideoContent(mc));
        const bareImage = m.type === "image" && mc.startsWith("data:") && !m.viewOnce;
        const bareDrawing = m.type === "drawing" && !!parseDrawingPayload(mc) && !m.viewOnce;
        const bareVideo = m.type === "video" && !m.viewOnce;
        const bareVoiceBubble = m.type === "voice";
        const bareViewOnceMedia =
          ((m.type === "image" || m.type === "video") && !!m.viewOnce && mc.startsWith("data:")) ||
          (m.type === "drawing" && !!m.viewOnce);
        const bareMedia =
          bareSticker || bareImage || bareVideo || bareViewOnceMedia || bareVoiceBubble || bareDrawing;
        const colClass = bareVideo
          ? CHAT_INLINE_MEDIA_COL
          : bareVoiceBubble
            ? "w-max max-w-[min(92vw,288px)] shrink-0"
            : bareImage || bareDrawing
              ? CHAT_INLINE_MEDIA_COL
              : bareSticker || bareViewOnceMedia
                ? "w-fit max-w-[min(90vw,280px)] shrink"
                : CHAT_TEXT_BUBBLE_COL;
        const bubbleBase = bareMedia
          ? "text-sm p-0 m-0 bg-transparent shadow-none ring-0 border-0 overflow-visible outline-none"
          : chatBubbleFilledClass(mine, isQuranChannel, theme, useIgDm, dmPalette ?? undefined);
        const bubbleClass =
          bubbleBase +
          (!bareMedia && vanishMode && m.id.startsWith("vx_")
            ? " ring-2 ring-orange-500/50 border border-orange-400/40"
            : "");
        const bubbleInlineStyle =
          useIgDm && dmPalette && !mine && !bareMedia ? chatDmPeerBubbleStyle(dmPalette) : undefined;
        const showBubbleTime = useIgDm && !bareMedia;
        return (
          <div key={m.id}>
            <ChatSwipeMessageRow
              message={m}
              mine={mine}
              isQuran={isQuranChannel}
              avatarName={!mine && showPeerAvatar ? senderProfile?.username || "?" : undefined}
              avatarSrc={!mine && showPeerAvatar ? senderProfile?.avatar : undefined}
              reservePeerAvatarSlot={!mine && !showPeerAvatar}
              onAvatarClick={
                !mine ? () => startTransition(() => onOpenProfile(m.senderId)) : undefined
              }
              onSwipeReply={() => onSwipeReply(m)}
              onPointerDown={onMsgPointerDown}
              onPointerMove={onMsgPointerMove}
              onPointerUp={onMsgPointerUp}
            >
              <div
                ref={el => {
                  if (el) messageElRefs.current.set(m.id, el);
                  else messageElRefs.current.delete(m.id);
                }}
                className={
                  "relative flex w-max flex-col gap-0.5 " +
                  colClass +
                  " " +
                  (useIgDm ? chatBubbleAlignClasses(mine) : mine ? "items-end self-end" : "items-start self-start")
                }
              >
                {(chat.isGroup || chat.isChannel) && !mine && (
                  <div className="mb-0.5 px-0.5 text-[11px] font-semibold text-muted-foreground">
                    {chat.groupNicknames?.[m.senderId]?.trim() || senderProfile?.username || "?"}
                  </div>
                )}
                <div className={bubbleClass} style={bubbleInlineStyle}>
                  {renderBubbleContent(m, mine)}
                  {showBubbleTime && (
                    <div
                      className="mt-0.5 flex items-center justify-end gap-0.5"
                      style={
                        useIgDm && dmPalette
                          ? { color: mine ? dmPalette.mineTime : dmPalette.peerTime }
                          : undefined
                      }
                    >
                      <span className="text-[11px] tabular-nums leading-none">
                        {formatChatBubbleTime(m.createdAt, lang)}
                      </span>
                      {mine && !vanishMode && <ChatMessageStatus status={m.status} mine compact />}
                    </div>
                  )}
                  {mine && !vanishMode && !useIgDm && (
                    <span className="mt-1 flex justify-end">
                      <ChatMessageStatus status={m.status} mine compact />
                    </span>
                  )}
                </div>
                {m.reactions && m.reactions.length > 0 && (
                  <div
                    className={
                      "-mt-2 z-[1] flex flex-wrap items-center gap-0.5 " +
                      (useIgDm
                        ? chatReactionAlignClasses(mine)
                        : mine
                          ? "self-end pe-1"
                          : "self-start ps-1")
                    }
                  >
                    {aggregateReactions(m.reactions).map(([emoji, count]) => (
                      <span
                        key={emoji}
                        className={
                          "inline-flex items-center gap-0.5 rounded-full bg-black/5 px-1.5 py-0.5 text-sm dark:bg-white/10 " +
                          (isQuranChannel ? "text-zinc-100" : "text-foreground")
                        }
                      >
                        <span className="leading-none">{emoji}</span>
                        {count > 1 && (
                          <span className="text-[10px] font-semibold opacity-75">{count}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </ChatSwipeMessageRow>
          </div>
        );
      })}
      {seenFooter && (
        <div
          className={
            "text-end text-[11px] px-1 pt-1 " +
            (isQuranChannel ? "text-zinc-500" : "text-muted-foreground")
          }
        >
          {seenFooter}
        </div>
      )}
      {isDmRoom && myOutgoing.length > 0 && !seenFooter && !useIgDm && (
        <div className="flex justify-end px-1 pt-0.5">
          <ChatMessageStatus status={myOutgoing[myOutgoing.length - 1]?.status} mine compact />
        </div>
      )}
    </>
  );
}

/** لا يُعاد رسمه عند كل حرف في شريط الكتابة — يمنع تعطل المحادثات الطويلة */
export const ChatRoomMessageListBody = memo(ChatRoomMessageListBodyInner);
