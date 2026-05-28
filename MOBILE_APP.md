# Reyweet — iOS App Store Readiness

## Architecture

Reyweet is a **Capacitor 7 hybrid mobile app**: React UI bundled inside a native Xcode shell (`com.reyweet.app`). This is a valid App Store model (same class as many shipped social apps).

## Verify before submit

```bash
npm run ios:prepare
npm run ios:icon
npm run appstore:verify
```

All three must pass with no errors.

## App Store checklist (codebase)

| Item | Status |
|------|--------|
| Native iOS project + bundle ID | Done |
| Bundled web (no remote `server.url`) | Done |
| HTTPS production API | Done |
| Camera / mic / photo usage strings (EN + AR) | Done |
| `ITSAppUsesNonExemptEncryption` = false | Done |
| `PrivacyInfo.xcprivacy` in Xcode | Done |
| In-app account deletion | Done (`Settings → Privacy`) |
| Privacy policy URL | Done — https://reyweet.vercel.app/privacy.html |
| No production API debug in bundle | Done |
| Codemagic `retweet-ios-app-store` workflow | Done |
| CapacitorKeyboard pod | Done |
| iOS 15+ deployment target | Done |

## App Store Connect (manual — your Apple account)

1. Create app **Reyweet** with bundle ID `com.reyweet.app`
2. Upload IPA from Codemagic (`retweet-ios-app-store`) or Xcode Archive
3. **Privacy policy URL:** `https://reyweet.vercel.app/privacy.html`
4. **Age rating:** Social networking + UGC → typically **12+** or **17+**
5. Screenshots (6.7", 6.5", 5.5" iPhone)
6. Export compliance: app uses standard HTTPS only → answer **No** for custom encryption (matches plist)
7. **Account deletion:** select “Yes, offered in the app” → Settings → Delete account

## Build & upload

```bash
npm run ios:prepare
npm run ios:open
# Xcode: Product → Archive → Distribute → App Store Connect
```

Or trigger **Reyweet iOS — App Store IPA** on Codemagic (requires App Store Connect API key in team settings).

## After code changes

Always run `npm run ios:prepare` before a new IPA so API URL and assets are correct on device.
