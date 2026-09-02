# Design: remote mobile gateway boundary

## Process boundary

```text
Capacitor mobile React UI
→ credential-scoped REST / WebSocket adapters
→ remote Hermes gateway
```

The mobile entry must not import or start Electron, local backend bootstrap, Python, Shell, or a local gateway.

## Authentication modes

### LAN compatibility

```text
http://RFC1918-IPv4
X-Hermes-Session-Token for REST
ws://.../api/ws?token=... for WebSocket
```

This mode requires explicit per-connection cleartext acknowledgment and never accepts hostname, IPv6, loopback (except compile-time emulator-only validation), public IP, embedded credentials, Basic, or OAuth.

### Secure mode

```text
https → native PKCE → secure credential store → Bearer REST
→ one-time WS ticket → wss://.../api/ws?ticket=...
```

Secure mode never falls back to LAN mode.

## Session consistency

Runtime session ID and durable/stored session ID are distinct. Mobile event consumers accept events only for the active runtime session. Replay `truncated` or changed epoch dispatches a local gap event; the UI rehydrates history only after runtime/stored identity matches both before and after the request.

## Mobile interaction contracts

- Approval uses original `{ session_id, request_id }` and only `once` / `deny`.
- Tool activity requires non-empty `tool_id` and `name`, is session-scoped, and stays outside transcript.
- Non-image files use `FileReader → file.attach → ref_text → prompt.submit` in order; attach errors fail closed.

## macOS continuation

See `docs/mobile-macos-handoff.md` for the iOS Keychain and Xcode validation sequence. The exact app-claimed HTTPS native callback remains a backend prerequisite.
