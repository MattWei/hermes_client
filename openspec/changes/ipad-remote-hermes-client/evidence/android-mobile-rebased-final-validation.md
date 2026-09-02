# Android final regression after remote-history rebase

- **Date:** 2026-09-02T15:56:31+08:00
- **Delivery branch:** `mobile-capacitor-client`
- **Verified commit:** `122a9713f31578e0de06ed45089f34ddbc35de9e`
- **Package:** `com.nousresearch.hermes.client`
- **Device:** Android API 36 emulator (`emulator-5554`)
- **Build mode:** default `VITE_MOBILE_HOME=1` production bundle. No emulator-only loopback flag, ADB reverse, proxy, backend address, token, or authenticated session was used.

## Automated verification

```text
npx openspec validate ipad-remote-hermes-client --strict
→ valid

apps/desktop npm run test:ui -- --run <11 mobile/UI files>
→ 11 files passed / 49 tests passed

apps/desktop npm run typecheck
→ passed

npx vitest run --environment jsdom apps/shared/src/json-rpc-gateway-replay.test.ts
→ 1 file passed / 9 tests passed
```

## Native package verification

```text
apps/desktop npm run cap:sync:android
→ completed

apps/desktop/android ./gradlew --no-daemon assembleDebug
→ BUILD SUCCESSFUL

adb install -r app/build/outputs/apk/debug/app-debug.apk
→ Success

adb shell monkey -p com.nousresearch.hermes.client 1
→ launch injected

mFocusedApp
→ com.nousresearch.hermes.client/.MainActivity

pidof com.nousresearch.hermes.client
→ 18964
```

## Artifacts

| Artifact | SHA-256 |
| --- | --- |
| `app-debug.apk` | `34ff23262ce9e58c112e410d61c70be874a87002fdfc9d5309a79325d48ff023` |
| `android-mobile-rebased-final.xml` | `7cb1b993695ecf27e8cd03a73c28b9318080fb92050ef0351cbb11337a83303c` |
| `android-mobile-rebased-final.png` | `3a416c3a0d2e0f02118e8affe7eaa47f8790fb2eb562e89695211b0b1c46dcf4` |

## Rendered offline-state evidence

The captured hierarchy and screenshot show the default remote-client surface:

- `Hermes` / `MOBILE CLIENT · PREVIEW`;
- `Backend not connected`;
- selected `Secure HTTPS/WSS` connection mode;
- backend-address input and `Validate connection` action;
- `Create a session to start a conversation`;
- disabled-looking `Send` control.

This proves the rebased delivery branch builds, installs, launches, and renders its default offline state. It does **not** claim LAN ingress, authenticated REST, WebSocket, native PKCE, trusted TLS, or iOS runtime validation.
