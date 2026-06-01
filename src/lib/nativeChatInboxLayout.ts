import { isNativeCapacitorShell } from "./apiUrlPolicy";
import { clearChatStackCssProgress } from "./chatStackGestureEngine";
import { CHAT_DISMISS_ROOM_TX_VAR, NAV_HIDE_PROGRESS_CSS_VAR } from "@/hooks/useBottomNavSheet";
import { snapChatNavInboxRest, type ChatNavLayerRefs } from "./chatNavStack";

const LAYOUT_SELECTORS =
  '#root, #root > .retweet-no-select-pane, [data-tab-panel="chat"], [data-tab-panel="chat"] .tab-panel-scroll, .chat-stack-scene, .chat-inbox-pane, .chat-inbox-scroll, [data-chat-stack-room]';

function pinFullWidth(el: HTMLElement): void {
  el.style.width = "100%";
  el.style.maxWidth = "100%";
  el.style.marginLeft = "0";
  el.style.marginRight = "0";
  el.style.marginInline = "0";
  el.style.left = "0";
  el.style.right = "0";
  el.style.insetInlineStart = "0";
  el.style.insetInlineEnd = "0";
  el.style.transform = "none";
  el.style.translate = "none";
}

/** iOS IPA — يُصفّر انزياح القائمة/التبويب ويملأ عرض الشاشة */
export function resetNativeChatInboxLayout(layers?: ChatNavLayerRefs): void {
  if (!isNativeCapacitorShell() || typeof document === "undefined") return;

  clearChatStackCssProgress();
  const root = document.documentElement;
  root.style.removeProperty(CHAT_DISMISS_ROOM_TX_VAR);
  root.style.removeProperty(NAV_HIDE_PROGRESS_CSS_VAR);

  document.querySelectorAll<HTMLElement>(LAYOUT_SELECTORS).forEach(pinFullWidth);

  const chatPanel = document.querySelector<HTMLElement>('[data-tab-panel="chat"]');
  if (chatPanel) {
    chatPanel.style.transform = "translate3d(0, 0, 0)";
    chatPanel.style.visibility = "visible";
    chatPanel.dataset.chatInboxSettled = "true";
  }

  const scene = document.querySelector<HTMLElement>(".chat-stack-scene");
  if (scene) {
    scene.style.overflow = "hidden";
    scene.style.contain = "none";
  }

  const room =
    layers?.roomEl ?? document.querySelector<HTMLElement>("[data-chat-stack-room]");
  const inbox = layers?.inboxEl ?? document.querySelector<HTMLElement>(".chat-inbox-pane");
  if (inbox || room) {
    const cap =
      typeof window !== "undefined"
        ? Math.round(window.visualViewport?.width ?? window.innerWidth)
        : undefined;
    snapChatNavInboxRest({ inboxEl: inbox, roomEl: room }, cap);
  }
  if (room) {
    room.style.transform = "translate3d(100%, 0, 0)";
    room.style.visibility = "hidden";
    room.style.pointerEvents = "none";
  }
  if (typeof document !== "undefined") {
    document.body.style.overflowX = "hidden";
    document.documentElement.style.overflowX = "hidden";
  }

  document.documentElement.classList.add("retweet-chat-inbox-pinned");
}
