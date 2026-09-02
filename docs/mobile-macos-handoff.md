# Hermes mobile client: macOS continuation handoff

## Scope and baseline

This checkout adapts the official Desktop React renderer into a Capacitor remote client for Android and iPadOS. Mobile code must not start Electron, a local Hermes agent, Python, Shell, or a local gateway.

Primary mobile entry:

```text
apps/desktop/src/main.tsx
VITE_MOBILE_HOME=1 → ./ipad-main
otherwise → ./desktop-main
```

The historical component name `IpadHome` is the shared Android/iPadOS page.

## Implemented and verified on Android

- Explicit LAN HTTP/WS mode only for literal RFC1918 IPv4, explicit risk confirmation, and static token.
- Secure HTTPS/WSS mode validation; no HTTPS-to-HTTP fallback.
- Android KeyStore AES-GCM secure credential plugin with provider-generated IV.
- `CapacitorHttp` only inside the mobile REST adapter to bypass authenticated WebView CORS preflight. No global fetch patch.
- Gateway connect, manual disconnect, unexpected close/error reset, and duplicate-connect prevention.
- Session create/list/resume/history, prompt stream handling, replay-gap history recovery.
- Session-bound approval UI (`once` / `deny`), tool activity UI, and non-image file attachment (`file.attach` before `prompt.submit`).

## Exact Android evidence

```text
mobile adapters/UI: 11 files / 49 tests passed
shared replay: 1 file / 9 tests passed
apps/desktop npm run typecheck: passed
apps/desktop npm run build:mobile: passed; 100 modules transformed
APK SHA-256: 34ff23262ce9e58c112e410d61c70be874a87002fdfc9d5309a79325d48ff023
```

See `openspec/changes/ipad-remote-hermes-client/evidence/`.

## macOS prerequisites

Use a macOS host with Xcode, an iOS simulator or physical iPad, and signing provisioned for `com.nousresearch.hermes.client`. Do not treat iOS project generation on Linux as iPadOS evidence.

From `apps/desktop`, invoke commands through Hermes `terminal`:

```bash
npm ci
npm run cap:sync:ios
npm run cap:open:ios
```

Use Xcode to select a simulator or device, build, install, and launch. Do not add a Web Storage credential fallback.

## Required iOS work

1. Implement the iOS counterpart of `SecureStorePlugin.java` using Keychain.
2. Register the Capacitor plugin from the iOS bridge and keep the same async `get` / `set` / `remove` renderer contract.
3. Prove Keychain round-trip at runtime using ephemeral test data; do not record credential values or ciphertext.
4. Validate default offline mobile UI on simulator/device.
5. Validate secure sign-in only after the backend permits the selected exact app-claimed HTTPS callback and the device trusts the ingress certificate.

## Secure PKCE blocker

The current backend rejects the chosen app-claimed HTTPS native callback:

```text
native redirect_uri must be http:// on the loopback interface
```

Do not bypass this using wildcard redirects, HTTP downgrade, self-signed trust exceptions, or an alternate production callback. The secure sequence remains:

```text
native PKCE authorize → exact HTTPS callback → native token exchange
→ secure storage → Bearer REST → one-time WS ticket → WSS
```

## iOS acceptance checks

- `npm run typecheck` and `npm run build:mobile` pass.
- `npm run cap:sync:ios` succeeds.
- Xcode build succeeds for the selected simulator/device.
- App launches into offline page without Electron/local backend activity.
- Keychain saves, reads, and removes an ephemeral value without plaintext persistence.
- After backend callback/TLS prerequisites are met: authenticated REST and ticketed WSS work with no credential-mode crossover.
