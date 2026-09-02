# Android mobile tool activity validation

Date: 2026-09-02

## Scope

Validated the mobile renderer's session-scoped tool activity surface. This is protocol and UI fixture coverage; it does **not** claim a live agent tool-execution E2E run.

## Contract

```text
tool.start | tool.progress | tool.complete
  → payload { tool_id, name, error? }
  → accept only event.session_id === active runtime session ID
  → update by tool_id
  → complete: complete or failed
```

The mobile renderer keeps at most three recent activity entries. Activity status does not modify the conversation transcript.

## RED → GREEN

Initial focused adapter test failed because `mobile-tool-activity-client` did not exist:

```text
Failed to resolve import "./mobile-tool-activity-client"
```

The UI regression then failed because no `tool.start` handler was registered. The implementation adds the narrow event adapter and an active-session-only UI subscription.

## Verification

```text
apps/desktop:
  npm run test:ui -- --run src/mobile-tool-activity-client.test.ts src/ipad-home.test.tsx
  → 2 files / 9 tests passed

  npm run typecheck
  → passed

  npm run build:mobile
  → passed; 99 modules transformed

project root:
  npx openspec validate ipad-remote-hermes-client --strict
  → Change 'ipad-remote-hermes-client' is valid

  git diff --check
  → passed
```

## Native Android packaging

```text
npm run cap:sync:android
./gradlew --no-daemon assembleDebug
adb install -r …/app-debug.apk
adb shell monkey -p com.nousresearch.hermes.client 1
```

Observed runtime state:

```text
mCurrentFocus=com.nousresearch.hermes.client/com.nousresearch.hermes.client.MainActivity
pid=17878
APK SHA-256=4ee11d702ea3d1966df06ce1a66ca0bba00bf541edb32600a70dc12ad07bfd05
```

No backend connection, dedicated session, prompt, tool call, credential, tunnel, or ADB reverse mapping was used in this validation.
