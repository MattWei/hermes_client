# Proposal: iPad/Android remote Hermes client

## Why

Provide a Capacitor mobile client that reuses official Desktop renderer and shared JSON-RPC contracts while keeping Hermes Agent execution on a remote computer.

## Scope

- Android and iPadOS shared React mobile entry.
- Explicit LAN HTTP/WS static-token mode guarded to RFC1918 IPv4.
- Secure HTTPS/WSS native-PKCE architecture with no fallback.
- Session, streaming, replay recovery, approval, tool activity, and non-image attachment paths.
- Native secure credential storage.

## Non-goals

- Bundling Electron, Python, Shell, a local Hermes agent, or a local gateway into mobile builds.
- Weakening backend CORS, callback validation, TLS validation, or authentication policy.

## Current status

Android implementation and native validation are complete for the feasible scope. Secure PKCE end-to-end is blocked by backend callback policy; iOS Keychain runtime validation is blocked by the absence of macOS/Xcode/iOS runtime in the current environment.
