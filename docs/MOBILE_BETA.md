# Mobile beta (Capacitor)

FVM Crop Solution ships as one repo: the existing **Next.js web app on Vercel** plus **Capacitor iOS/Android shells** for farmer beta testing.

The native apps load the same hosted frontend/backend (`NEXT_PUBLIC_APP_URL`, default `https://crop.farmersvaluemart.com`). Do **not** submit to the App Store or Play Store from this guide.

## What stays the same

- Web deployment on Vercel is unchanged
- Guest mode and registered accounts
- Supabase auth, cases, weather, photo upload, voice notes, follow-ups, FVM branding
- Staff / admin dashboards remain on the **web only** (hidden from farmer mobile navigation and blocked in the native shell)

## Identifiers

| Field | Value |
| --- | --- |
| App name | FVM Crop Solution |
| Display name | FVM Crop Solution |
| Bundle / package ID | `com.farmersvaluemart.fvmcropsolution` |
| Custom URL scheme | `fvmcropsolution://` |

## Install locally (one-time)

### All platforms

```bash
git clone <this-repo>
cd fvmltd-farmer-assistant
npm install
```

Optional: point the WebView at a non-production host while testing:

```bash
export CAPACITOR_SERVER_URL=https://crop.farmersvaluemart.com
# or a Vercel preview URL
npx cap sync
```

### iOS (macOS only)

Install:

1. **Xcode** (latest stable from the Mac App Store)
2. **Xcode Command Line Tools**: `xcode-select --install`
3. **CocoaPods** (if your Xcode project uses pods; Capacitor 8 may use SPM): `sudo gem install cocoapods`
4. An **Apple Developer** account signed into Xcode → Settings → Accounts

### Android

Install:

1. **Android Studio** (latest stable)
2. Android SDK Platform matching the project `compileSdk` (open the project once; Studio prompts)
3. A device or emulator
4. JDK 17+ (Android Studio usually bundles one)

## Sync native projects after JS / config changes

```bash
npm install
npx cap sync
```

Or:

```bash
npm run mobile:sync
```

## Build iOS (exact commands)

On a Mac:

```bash
npm install
npx cap sync ios
npx cap open ios
```

Then in Xcode:

1. Select the **App** target
2. Signing & Capabilities → choose your Team
3. Bundle Identifier must stay `com.farmersvaluemart.fvmcropsolution`
4. Pick a simulator or a physical iPhone
5. Product → Run (⌘R)

Archive for TestFlight (beta, not store submit yet):

```bash
# From the repo root, after sync:
npx cap sync ios
npx cap open ios
# Xcode: Product → Archive → Distribute App → App Store Connect → TestFlight
```

CLI alternative (requires a configured signing team):

```bash
cd ios/App
xcodebuild -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath build/FVMCropSolution.xcarchive archive
```

## Build Android (exact commands)

```bash
npm install
npx cap sync android
npx cap open android
```

Then in Android Studio:

1. Wait for Gradle sync
2. Select a device / emulator
3. Run ▶

CLI debug APK:

```bash
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

CLI release bundle (requires a keystore you create locally — do not commit it):

```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

## Permissions already wired

| Capability | iOS | Android |
| --- | --- | --- |
| Camera / photos | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` | `CAMERA`, `READ_MEDIA_IMAGES` |
| Microphone / voice notes | `NSMicrophoneUsageDescription` | `RECORD_AUDIO` |
| Deep links | `fvmcropsolution://` URL types | intent-filters for `fvmcropsolution` + `https://crop.farmersvaluemart.com` |

Push notifications are **prepared for later** (AppDelegate comment, Android `google-services.json` hook) but **not** enabled. Do not add `@capacitor/push-notifications` yet.

## Auth / redirects

- Canonical auth callback: `{NEXT_PUBLIC_APP_URL}/auth/callback`
- Add that URL to Supabase Auth → URL configuration → Redirect URLs
- OAuth (Google / Apple) opens the system browser on native and returns via the redirect URL
- Custom scheme `fvmcropsolution://` is registered for future deep-link returns

## Can Vercel keep serving the mobile app?

**Yes.** The Capacitor shells use `server.url` so they load the same Next.js deployment Vercel already hosts (API routes, SSR, cookies, Supabase). Ship web updates on Vercel; farmers get them the next time they open the native app (no store resubmit for pure web changes). Native plugin / permission changes still require a new binary.

## Apple / Google account steps (manual)

### Apple

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/)
2. In App Store Connect, create an app with bundle ID `com.farmersvaluemart.fvmcropsolution`
3. Create a provisioning profile / let Xcode manage signing
4. For TestFlight: archive in Xcode → upload → add internal/external testers
5. Later (not now): enable Push Notifications + Associated Domains for Universal Links
6. Register the camera / mic privacy strings (already in `Info.plist`) — App Privacy questionnaire when you eventually submit

### Google

1. Create a [Google Play Console](https://play.google.com/console) developer account
2. Create an app named **FVM Crop Solution** with package `com.farmersvaluemart.fvmcropsolution`
3. Use an **internal testing** track for beta APK/AAB (do not publish production)
4. Create an upload keystore locally; store it outside git
5. Later: verify Digital Asset Links for `https://crop.farmersvaluemart.com` App Links
6. Later: add Firebase / `google-services.json` when enabling FCM push

## Farmer navigation (mobile)

Bottom nav remains Home / Check / Assist / Results only. Staff, admin, and AI Lab routes are not linked and are redirected to `/` inside the native shell.
