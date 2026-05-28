import type { Chat, ID } from "./types";
import type { GroupRegistryRecord, GroupRole, GroupSettings } from "./groupTypes";
import { apiFetch, getApiToken } from "./apiBackend";

async function groupFetch<T>(
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = init?.token ?? getApiToken();
  const res = await apiFetch(path, { ...init, token });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) return { ok: false, error: (data as { error?: string }).error || "فشل الطلب" };
  return { ok: true, data };
}

export async function apiGetGroup(chatId: ID) {
  return groupFetch<{ group: GroupRegistryRecord; chat: Chat }>(
    `/v1/groups/${encodeURIComponent(chatId)}`,
    { method: "GET" },
  );
}

export async function apiGetGroupRbacMatrix() {
  return groupFetch<{ roles: Record<GroupRole, readonly string[]> }>("/v1/groups/rbac/matrix", {
    method: "GET",
  });
}

export async function apiPatchGroupSettings(
  chatId: ID,
  patch: Partial<GroupSettings> & { name?: string; description?: string; avatar?: string },
) {
  return groupFetch<{ chat: Chat }>(`/v1/groups/${encodeURIComponent(chatId)}/settings`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function apiSetGroupMemberRole(chatId: ID, userId: ID, role: GroupRole) {
  return groupFetch<{ chat: Chat }>(
    `/v1/groups/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/role`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export async function apiTransferGroupOwnership(chatId: ID, newOwnerId: ID) {
  return groupFetch<{ chat: Chat }>(
    `/v1/groups/${encodeURIComponent(chatId)}/transfer-ownership`,
    { method: "POST", body: JSON.stringify({ newOwnerId }) },
  );
}

export async function apiBanGroupMember(chatId: ID, userId: ID) {
  return groupFetch<{ chat: Chat }>(
    `/v1/groups/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/ban`,
    { method: "POST" },
  );
}

export async function apiMuteGroupMember(chatId: ID, userId: ID, durationMinutes = 60) {
  return groupFetch<{ chat: Chat; mutedUntil: number }>(
    `/v1/groups/${encodeURIComponent(chatId)}/members/${encodeURIComponent(userId)}/mute`,
    { method: "POST", body: JSON.stringify({ durationMinutes }) },
  );
}

export async function apiDeleteGroup(chatId: ID) {
  return groupFetch<{ ok: true }>(`/v1/groups/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });
}

export async function apiGetGroupAudit(chatId: ID) {
  return groupFetch<{ entries: unknown[] }>(
    `/v1/groups/${encodeURIComponent(chatId)}/audit`,
    { method: "GET" },
  );
}
