let activeChatId: string | null = null;

export function setActiveChatFocus(chatId: string | null): void {
  activeChatId = chatId?.trim() || null;
}

export function getActiveChatFocus(): string | null {
  return activeChatId;
}
