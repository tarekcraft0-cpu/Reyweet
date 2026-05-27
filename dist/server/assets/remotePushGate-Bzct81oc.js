let hydrated = false;
let serverOwnerPostCount = 0;
function markServerHydrated(ownerId, state) {
  hydrated = true;
  if (!ownerId) {
    serverOwnerPostCount = 0;
    return;
  }
  serverOwnerPostCount = (state.posts || []).filter((p) => p.userId === ownerId).length;
}
function resetServerHydrated() {
  hydrated = false;
  serverOwnerPostCount = 0;
}
function shouldAllowRemotePush(state) {
  if (!hydrated) return false;
  const uid = state.currentUserId;
  if (!uid) return true;
  const mine = (state.posts || []).filter((p) => p.userId === uid).length;
  if (serverOwnerPostCount >= 2 && mine + 1 < serverOwnerPostCount) {
    console.warn(
      `[Retweet] تجاهل رفع لقطة قديمة (${mine} محلي / ${serverOwnerPostCount} على الخادم)`
    );
    return false;
  }
  return true;
}
export {
  markServerHydrated,
  resetServerHydrated,
  shouldAllowRemotePush
};
