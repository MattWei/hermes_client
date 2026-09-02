# Android mobile unexpected gateway-close recovery validation

Date: 2026-09-02

## Scope

The mobile page now subscribes to the official shared `JsonRpcGatewayClient.onState` API when supplied by the gateway. On `closed` or `error`, it clears the same connection/session-bound state used by explicit disconnect, without calling `gateway.close()` a second time.

The event fixture regression covers:

```text
connected gateway → shared state `closed`
→ offline capsule
→ disabled composer
```

## RED → GREEN

Initial test failed because the page had not subscribed to `onState`. After the minimal subscription and shared reset implementation:

```text
npm run test:ui -- --run src/ipad-home.test.tsx
→ 1 file / 10 tests passed

npm run typecheck
→ passed

npm run build:mobile
→ passed; 100 modules transformed

git diff --check
→ passed
```

## Android native packaging

```text
npm run cap:sync:android
./gradlew --no-daemon assembleDebug
adb install -r app-debug.apk
adb launch
```

Observed after launch:

```text
mCurrentFocus=com.nousresearch.hermes.client/com.nousresearch.hermes.client.MainActivity
pid=18419
APK SHA-256=34ff23262ce9e58c112e410d61c70be874a87002fdfc9d5309a79325d48ff023
```

This is native packaging/runtime surface evidence only. No remote gateway, session, prompt, credential, or file upload was exercised.
