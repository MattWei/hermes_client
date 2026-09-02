# Android mobile gateway disconnect validation

Date: 2026-09-02

## Scope

Added an explicit mobile `Disconnect gateway` control. It closes the active gateway, clears REST/session/transcript/approval/tool-activity/draft/attachment state, resets the runtime-to-stored session identity ref, and returns the composer to its disabled offline state.

The top-level connection capsule now reflects the actual gateway state:

```text
no gateway → Backend not connected
connected gateway → LAN gateway connected.
```

The connected state is set only after the gateway adapter resolves; validation and secure-storage save do not set it.

## RED → GREEN

The UI regression initially failed because no `Disconnect gateway` button existed. After the implementation:

```text
npm run test:ui -- --run src/ipad-home.test.tsx
→ 1 file / 9 tests passed

npm run typecheck
→ passed

npm run build:mobile
→ passed; 100 modules transformed

git diff --check
→ passed
```

## Android native verification

```text
npm run cap:sync:android
./gradlew --no-daemon assembleDebug
adb install -r app-debug.apk
adb launch
```

Observed runtime state:

```text
mCurrentFocus=com.nousresearch.hermes.client/com.nousresearch.hermes.client.MainActivity
pid=18252
APK SHA-256=087d6b5d2cd2715edd7b88c4336fd9b203c679d6864f66ddc01b7782e9acdbd9
```

No backend was connected and no credential, session, prompt, attachment, or tool call was used during native packaging validation.

## Reconnect guard

A connected gateway now disables `Connect LAN gateway`; users must explicitly disconnect before opening another transport. The UI regression verifies the button becomes disabled after a successful connect and becomes enabled again after `Disconnect gateway`. This prevents a second socket from silently replacing the active session transport.
