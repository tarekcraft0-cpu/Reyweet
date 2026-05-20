/**
 * التخزين السحابي (Supabase) أُزيل — التطبيق يعتمد على الخادم المحلي فقط (`VITE_API_URL`).
 */
import type { AppState } from "./types";

export function isCloudEnabled(): boolean {
  return false;
}

/** @deprecated */
export const cloudEnabled = false;

export async function ensureCloudConfig(): Promise<void> {
  /* no-op */
}

export function getAuthEmailRedirectUrl(): string | undefined {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return undefined;
}

export function getSupabaseClient(): null {
  return null;
}

export async function loadCloudState(_userId: string): Promise<AppState | null> {
  return null;
}

export async function saveCloudState(_userId: string, _state: AppState): Promise<void> {
  /* no-op */
}
