import type { AppState } from "./types";

type Normalizer = (s: AppState) => AppState;

let normalizer: Normalizer | null = null;

/** يُسجَّل من store عند التحميل — يكسر الاستيراد الدائري مع apiBackend */
export function setPersistedAppStateNormalizer(fn: Normalizer): void {
  normalizer = fn;
}

export function normalizeRemoteAppState(state: AppState): AppState {
  return normalizer ? normalizer(state) : state;
}
