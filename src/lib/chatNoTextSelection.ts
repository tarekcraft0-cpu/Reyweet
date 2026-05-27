/** عناصر يُسمح فيها بالتحديد/لصق النص (مربع الكتابة فقط) */
export const CHAT_ALLOW_SELECT_SELECTOR =
  'input, textarea, select, [contenteditable="true"], .chat-allow-select';

export function isChatAllowSelectTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(CHAT_ALLOW_SELECT_SELECTOR);
}

/** يمنع التحديد الأزرق وقائمة iOS الافتراضية داخل غرفة المحادثة */
export function preventChatNativeTextMenu(e: Event) {
  if (isChatAllowSelectTarget(e.target)) return;
  e.preventDefault();
}

export const chatNoSelectCaptureHandlers = {
  onSelectStartCapture: preventChatNativeTextMenu,
  onContextMenuCapture: preventChatNativeTextMenu,
  onDragStartCapture: preventChatNativeTextMenu,
} as const;
