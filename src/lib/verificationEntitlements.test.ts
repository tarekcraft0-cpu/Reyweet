import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getUserEntitlements,
  hasActiveSubscription,
  isAnimatedAvatarUrl,
  isStoryStillActive,
  isVerifiedBadgeActive,
} from "./verificationEntitlements.ts";

describe("verification entitlements", () => {
  it("non-subscriber cannot request verification flow flags", () => {
    const ent = getUserEntitlements({
      verified: false,
      isSubscribed: false,
      verificationStatus: "none",
    });
    assert.equal(ent.canRequestVerification, false);
    assert.equal(ent.isVerified, false);
  });

  it("subscribed but unapproved cannot use animated avatar", () => {
    const ent = getUserEntitlements({
      verified: false,
      isSubscribed: true,
      verificationStatus: "none",
    });
    assert.equal(ent.canRequestVerification, true);
    assert.equal(ent.canUseAnimatedAvatar, false);
  });

  it("approved verified user gets premium limits", () => {
    const ent = getUserEntitlements({
      verified: true,
      isSubscribed: true,
      verificationStatus: "approved",
      canUseAnimatedAvatar: true,
    });
    assert.equal(ent.isVerified, true);
    assert.equal(ent.postCharacterLimit, 1000);
    assert.equal(ent.storyMaxDurationSec, 60);
    assert.deepEqual(ent.storyExpiryHoursOptions, [24, 48, 72]);
    assert.equal(ent.canUseAnimatedAvatar, true);
  });

  it("legacy verified subscriber keeps grandfather rights", () => {
    const user = {
      verified: true,
      isSubscribed: true,
      verificationStatus: "none" as const,
    };
    assert.equal(isVerifiedBadgeActive(user), true);
    const ent = getUserEntitlements(user);
    assert.equal(ent.isVerified, true);
    assert.equal(ent.postCharacterLimit, 1000);
  });

  it("non-verified has 300 chars and 30s story", () => {
    const ent = getUserEntitlements({ verified: false, isSubscribed: false });
    assert.equal(ent.postCharacterLimit, 300);
    assert.equal(ent.storyMaxDurationSec, 30);
    assert.deepEqual(ent.storyExpiryHoursOptions, [24]);
  });

  it("story expiry respects 48h for verified", () => {
    const ent = getUserEntitlements({
      verified: true,
      isSubscribed: true,
      verificationStatus: "approved",
    });
    const createdAt = Date.now() - 25 * 60 * 60 * 1000;
    assert.equal(isStoryStillActive({ createdAt, expiryHours: 48 }, ent), true);
    assert.equal(isStoryStillActive({ createdAt, expiryHours: 24 }, ent), false);
  });

  it("unverified story expires after 24h only", () => {
    const ent = getUserEntitlements({ verified: false });
    const createdAt = Date.now() - 25 * 60 * 60 * 1000;
    assert.equal(isStoryStillActive({ createdAt, expiryHours: 48 }, ent), false);
  });

  it("detects animated avatar urls", () => {
    assert.equal(isAnimatedAvatarUrl("https://x.com/a.gif"), true);
    assert.equal(isAnimatedAvatarUrl("data:image/gif;base64,abc"), true);
    assert.equal(isAnimatedAvatarUrl("/media/u/avatar.jpg"), false);
  });

  it("subscription required helper", () => {
    assert.equal(hasActiveSubscription({ isSubscribed: false }), false);
    assert.equal(hasActiveSubscription({ isSubscribed: true }), true);
  });
});
