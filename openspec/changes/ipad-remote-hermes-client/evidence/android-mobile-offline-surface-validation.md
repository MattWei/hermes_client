# Android default mobile offline surface validation

Date: 2026-09-02

## Full current-environment verification

```text
mobile adapter/UI suite
→ 11 files / 49 tests passed

shared JsonRpcGateway replay suite
→ 1 file / 9 tests passed

apps/desktop npm run typecheck
→ passed

apps/desktop npm run build:mobile
→ passed; 100 modules transformed

git diff --check
→ passed
```

## Mobile process boundary scan

The mobile entry (`main.tsx` → `ipad-main.tsx`) and all `mobile-*.ts` source files were scanned for:

```text
hermesDesktop
ensureBackend
electron
child_process
```

Result: no matches.

This confirms the mobile-specific source graph does not directly call Electron IPC, local backend bootstrap, or a local child-process path.

## Android native offline evidence

The default, non-emulator-loopback APK was synced, built, installed, and launched.

```text
mCurrentFocus=com.nousresearch.hermes.client/com.nousresearch.hermes.client.MainActivity
pid=18600
APK SHA-256=34ff23262ce9e58c112e410d61c70be874a87002fdfc9d5309a79325d48ff023
```

Captured evidence:

```text
android-mobile-offline-surface.xml
SHA-256=590b387a094450937089e04b3d22f9bdeeebad1d6af69ba447ecbe9adf54c9f8

android-mobile-offline-surface.png
SHA-256=511b8fd99a6140c80a5c7a98ec0aa2388b3ec50e4831fe5c831cf1b73a266266
```

Visible screenshot/hierarchy state:

```text
Hermes
MOBILE CLIENT · PREVIEW
Backend not connected
Secure HTTPS/WSS
Create a session to start a conversation
Send disabled
```

This validation intentionally did not connect a gateway or use credentials, a session, a prompt, an attachment, or a tool.
