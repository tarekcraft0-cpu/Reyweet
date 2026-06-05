import { apiFetch, getApiToken } from "./apiBackend";

export type MessageSearchHit = {
  chatId: string;
  messageId: string;
  preview: string;
  createdAt: number;
  isGroup: boolean;
  chatLabel: string;
};

export async function apiSearchChatMessages(
  query: string,
  limit = 25,
): Promise<MessageSearchHit[]> {
  const token = getApiToken();
  if (!token || query.trim().length < 2) return [];
  const q = encodeURIComponent(query.trim());
  const res = await apiFetch(`/v1/chats/search-messages?q=${q}&limit=${limit}`, {
    method: "GET",
    token,
    timeoutMs: 45_000,
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { hits?: MessageSearchHit[] } | null;
  return data?.hits ?? [];
}
