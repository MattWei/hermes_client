# Tasks

## Completed in WSL/Android

- [x] Mobile entry split and Capacitor Android/iOS project generation.
- [x] LAN endpoint/auth gates and Android secure store.
- [x] Native REST adapter, session lifecycle, streaming, and replay recovery.
- [x] Session-scoped approval and tool activity UI.
- [x] Non-image attachment staging and prompt reference ordering.
- [x] Connect/disconnect/unexpected-close/reconnect state controls.
- [x] Android API 36 build, install, launch, offline screenshot/hierarchy evidence.
- [x] Rebased delivery branch (`mobile-capacitor-client`) API 36 build/install/launch regression and pushed evidence (`android-mobile-rebased-final-validation.md`).
- [x] Mobile adapter/UI suite, shared replay suite, typecheck, mobile build, diff check.

## Completed on macOS/iOS

- [x] iOS project configuration repairs required on a real macOS host: shared scheme
  (`App.xcscheme`) and workspace `self:` reference for `-scheme` resolution.
- [x] `npm install` + `npm run build:mobile` + `cap sync ios` on macOS; entry bundle selects the
  mobile (`ipad-main`) branch, never `desktop-main`.
- [x] Mobile adapter/UI suite re-verified on macOS (11 files / 49 tests).
- [x] Xcode 26.5 build for the iOS 26.5 Simulator (`BUILD SUCCEEDED`) and install/launch into the
  offline mobile home on an iPad (A16) simulator.
- [x] Evidence recorded in `evidence/ios-simulator-offline-home-validation.md` and
  `evidence/ios-offline-home.png`.
- [x] iOS Keychain plugin implemented (`SecureStorePlugin.swift`, contract parity with the Android
  plugin) and registered through an app-local `MainViewController` bridge subclass.
- [x] Keychain round-trip proven at runtime with ephemeral data (`set` / `get` match / `remove` /
  `after-remove` empty) — `evidence/ios-keychain-secure-store-validation.md`.
- [x] Build requirement identified: simulator builds must keep default (ad-hoc) signing;
  `CODE_SIGNING_ALLOWED=NO` causes Keychain `errSecMissingEntitlement (-34018)`.
- [x] iOS bundle id unified with the Capacitor `appId` / Android `applicationId`
  (`com.nousresearch.hermes.ipad` → `com.nousresearch.hermes.client`).
- [x] Visible attachment entry added to the mobile composer (the file input was `sr-only` with no
  trigger), plus the iOS camera/photo/microphone usage descriptions the picker requires.
- [x] Evidence: `evidence/ios-attachment-picker-and-bundle-id.md`.

## Pending external prerequisites

- [ ] Backend: allow the selected exact app-claimed HTTPS native PKCE callback; preserve strict redirect validation.
- [ ] Ingress: provide a trusted HTTPS hostname/certificate whose served SAN matches the mobile endpoint and association files.
- [ ] macOS: run authenticated native PKCE → REST → WS-ticket → WSS end-to-end after backend/ingress prerequisites.
- [ ] macOS: manually verify the attachment picker with a live session (Attach → Photos/Camera/Browse →
  pending chip). A programmatic click cannot open it; iOS requires a real user gesture.
- [ ] macOS: verify signing/provisioning for `com.nousresearch.hermes.client` on a physical device.
- [ ] WSL/Android: re-verify the shared composer change (`Attach` entry in `ipad-home.tsx`) on the
  Android target, since the renderer is shared and the Android evidence predates it.
- [ ] Protocol: image/PDF attachment transport (`image.attach_bytes`, `pdf.attach`) remains unimplemented;
  the verified path is `file.attach` for non-image files only.

## Evidence

See `evidence/` and `docs/mobile-macos-handoff.md`.
