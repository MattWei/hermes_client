# Android mobile non-image attachment validation

Date: 2026-09-02

## Scope

Implemented the first safe mobile attachment path for non-image files only:

```text
File picker → pending removable file chips → browser FileReader data URL
→ file.attach(session_id, path, name, data_url)
→ verified ref_text → prompt.submit(same session_id, text + @file ref)
```

Images and PDFs are deliberately not represented as supported by this UI. Their server contracts use `image.attach_bytes` and `pdf.attach`, respectively, and remain outside this narrowly verified first path.

If attaching any file fails, `prompt.submit` is not called and no optimistic user message is appended.

## RED → GREEN

The initial adapter test failed as expected because `mobile-attachment-client` did not exist. The minimal client then passed the exact required ordering and runtime session ownership test.

## Verification

```text
npm run test:ui -- --run \
  src/mobile-attachment-client.test.ts \
  src/mobile-prompt-client.test.ts \
  src/ipad-home.test.tsx
→ 3 files / 11 tests passed

npm run typecheck
→ passed

npm run build:mobile
→ passed; 100 modules transformed

git diff --check
→ passed
```

## Android native package

```text
npm run cap:sync:android
./gradlew --no-daemon assembleDebug
adb install -r app-debug.apk
adb launch
```

Observed:

```text
mCurrentFocus=com.nousresearch.hermes.client/com.nousresearch.hermes.client.MainActivity
pid=18071
APK SHA-256=c7d3969a9a98d55683440a23e25508439622b00f9bb0761c1c05093fcfe84f12
```

No backend was connected, no session was created, and no user file was selected or uploaded during validation.
