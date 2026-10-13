# iOS Simulator offline-home build and launch validation

Date: 2026-09-12

## Scope

First successful macOS-side build of the Capacitor iPadOS target from the rebased mobile
delivery. It validates the iOS project builds and launches into the default offline mobile
home. It does **not** validate Keychain credentials, authenticated REST, PKCE, WSS tickets,
or any real backend connection.

## Source revision

```text
Repository: https://github.com/MattWei/hermes_client.git
Commit: 987e1ed8401c0290fbef36bb4383dfb2afbd18ec
Subject: Merge pull request #6 from MattWei/mobile-capacitor-client
Mobile delivery commit: 122a971 feat: add Capacitor remote mobile client
```

## Environment

```text
macOS 26.6.2 (25G83)
Xcode 26.5 (17F42)
iOS 26.5 Simulator runtime 23F77 (com.apple.CoreSimulator.SimRuntime.iOS-26-5)
Destination: iPad (A16), iOS 26.5
Node: v23.11.0 / npm 10.9.2
Capacitor: 8.5.0 (Swift Package Manager, no CocoaPods Podfile)
```

## Build sequence (from `apps/desktop`)

```bash
npm install --workspace apps/desktop      # 1214 packages, hoisted to repo root node_modules
npm run build:mobile                      # VITE_MOBILE_HOME=1 vite build
npx cap sync ios                          # copies dist -> ios/App/App/public
xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPad (A16)' \
  -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
```

Result: `** BUILD SUCCEEDED **`

- Entry bundle correctly selects the mobile branch: `dist/assets/index-*.js` dynamically
  imports `./ipad-main-*.js` (not `desktop-main`), so the iOS build never pulls in Electron or
  a local backend path.
- Mobile UI/adapter suites pass on macOS: 11 files / 49 tests.
- `npm run build:mobile` output: ipad-main chunk 76.12 kB (gzip 25.03 kB).

## Install and launch

```bash
xcrun simctl boot "iPad (A16)"
xcrun simctl install "iPad (A16)" <DerivedData>/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "iPad (A16)" com.nousresearch.hermes.ipad
```

Artifact:

```text
App.app size: 15 MB
Main binary: Mach-O 64-bit executable x86_64
App binary sha256: e3c5489098cb606c00a86fd2b0269a6bad5bdae8a2e5ea5d077617ec0f018154
Bundle tree sha256: e8d3c25ee1b2054b54e06653b8998eec833db9c06e8d39bd8069aba209fcbc3d
```

Rendered result (screenshot): `ios-offline-home.png`
(sha256 `dc298588394cb2e6aea5f6cb62b03289e62887493ad0808178703b496fbd4671`)

Observed UI: Hermes brand mark and "Your remote workspace" header, "MOBILE CLIENT · PREVIEW",
"Ready when your workspace is.", the disconnected badge "Backend not connected", the
"Connection mode" selector (Secure HTTPS/WSS), the "Backend address" field, the connection
validation action, and the disabled composer showing "Create a session to start a
conversation". No Electron or local-backend activity occurred; the app stayed on the offline
surface.

## Build-environment issues resolved (macOS host)

These were host environment problems, not repository defects:

1. `ibtool`/destination failures reported `iOS 26.5 Platform Not Installed` until the iOS
   26.5 Simulator runtime (23F77, 10.6 GB) was downloaded and installed via
   `xcodebuild -downloadPlatform iOS`. Ensure ~15 GB free disk before downloading.
2. `App.xcodeproj` had no `xcshareddata/xcschemes/App.xcscheme` and no
   `project.xcworkspace/contents.xcworkspacedata` when generated off-macOS; a shared scheme
   and the standard workspace `self:` reference were added to make `-scheme` resolution work.
3. Builds must not run in an environment whose `node` resolves to Node 18 (rolldown requires
   `node:util.styleText`, Node >= 20.12). Use Node 22+ / 26.

## Explicit non-claims

- No iOS Keychain `SecureStore` plugin exists yet; the iOS counterpart of
  `SecureStorePlugin.java` is still pending (see `docs/mobile-macos-handoff.md`).
- No backend address, token, password, cookie, or WS ticket was entered in the simulator.
- No authenticated REST, native PKCE, WS ticket, or WSS session was exercised.
- No physical iPad, LAN ingress, or trusted-certificate validation was performed.
- The build used `CODE_SIGNING_ALLOWED=NO`; signing/provisioning for
  `com.nousresearch.hermes.client` remains unverified.
