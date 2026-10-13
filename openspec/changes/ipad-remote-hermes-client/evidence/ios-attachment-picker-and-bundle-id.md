# iOS attachment picker entry, system-permission bridge, and unified bundle id

Date: 2026-09-12

## Scope

Three related changes on the macOS/iOS side:

1. Give the mobile composer a **visible attachment entry** (the file input was `sr-only`
   with no trigger element, so it was unreachable by a touch user).
2. Add the iOS **system usage descriptions** that the picker requires, so choosing
   Photos or Camera does not terminate the app.
3. **Unify the iOS bundle identifier** with the Capacitor `appId` / Android applicationId.

Image and PDF *transport* is explicitly out of scope: the verified attachment contract
remains `file.attach` for non-image files (see
`android-mobile-non-image-attachment-validation.md`); `image.attach_bytes` and `pdf.attach`
are separate server contracts that this change does not implement.

## Implementation

### 1. Visible attachment entry (`src/ipad-home.tsx`)

The existing input:

```html
<input aria-label="Attach file" className="sr-only" ... type="file" />
```

was screen-reader-only with no visible control bound to it. It now carries
`id="ipad-attachment"` and a visible label drives it:

```html
<label aria-disabled={!sessionId} htmlFor="ipad-attachment" ...>Attach</label>
```

The label keeps the existing secondary-button styling and is rendered inert
(`pointer-events-none opacity-40`) until a session exists, matching the composer/send gate:
attachment submission is session-scoped by contract, so the entry is disabled without one.

### 2. iOS picker permission bridge (`ios/App/App/Info.plist`)

A WKWebView file input hands off to system UI for Photos and Camera. iOS terminates an app
that reaches those pickers without a matching usage description, so all three were added:

```text
NSCameraUsageDescription
NSMicrophoneUsageDescription
NSPhotoLibraryUsageDescription
```

No Capacitor camera/photos plugin is introduced: the shared `<input type="file">` plus the
platform's own picker is the whole mechanism, which keeps Android on the verified path.

### 3. Unified bundle id (`ios/App/App.xcodeproj/project.pbxproj`)

```text
before: PRODUCT_BUNDLE_IDENTIFIER = com.nousresearch.hermes.ipad   (Debug and Release)
after:  PRODUCT_BUNDLE_IDENTIFIER = com.nousresearch.hermes.client
```

This now matches `capacitor.config.ts` (`appId`) and the Android `applicationId`.

## Verification

Environment: Xcode 26.5, iOS 26.5 Simulator (23F77), iPad (A16), default (ad-hoc) signing.

Mobile suite after the renderer change:

```text
11 files / 49 tests passed
```

Packaged artifact checks:

```text
CFBundleIdentifier        => com.nousresearch.hermes.client
NSCameraUsageDescription  => present
NSMicrophoneUsageDescription => present
NSPhotoLibraryUsageDescription => present
Signature                 => adhoc
App binary sha256         => 48af0b9e6f420da1addb073ec71e29dd12fd4fb809819a7185c7abdac7b35462
```

Install/launch with the new identifier on the iPad (A16) simulator, then the offline home
rendered with the new **Attach** control visible at the composer:

- Screenshot: `ios-attach-button.png`
  (sha256 `9f22865f8adafc1ca018f146bf4c7c650c420e3a564449248430a60932cb86b1`)

A temporary in-page probe confirmed the input is present and reachable
(`input=found | click dispatched`), but **a programmatic click does not open the system
picker** — iOS only presents it for a real user gesture. The picker therefore cannot be
driven from a script and remains a manual step.

## Manual step still required

To close the attachment entry end to end, on the simulator or a device:

1. Connect a backend and create a session (the Attach control is gated on a session).
2. Tap **Attach** and confirm the system menu offers Photos / Camera / Browse.
3. Select a file and confirm it appears as a removable pending attachment chip.

A test photo has been added to the simulator's photo library to make step 2 observable.

## Explicit non-claims

- No file was actually selected or uploaded through the iOS picker in this validation.
- No image or PDF transport (`image.attach_bytes`, `pdf.attach`) is implemented.
- No real backend, session, or credential was used.
- The picker's Photos/Camera choices were not exercised, so the usage descriptions are
  present and correctly packaged but not yet proven by an actual permission prompt.
