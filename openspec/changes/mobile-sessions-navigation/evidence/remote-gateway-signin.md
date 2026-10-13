# Remote gateway sign-in (HTTPS + username/password)

## Outcome

Confirmed working end to end by the user on the physical iPad (iPad Pro 11", iOS 26.2.1) against
`https://api.wei-agent.com` — sign-in succeeds and the client connects. This closes the path that
was previously unimplemented in the shipped app.

## What the desktop client actually does

The desktop app was already connected to this gateway, so the working mechanism was read off it
rather than invented:

```text
GET  /api/auth/providers      -> [{"name":"basic","supports_password":true}]
POST /auth/password-login     -> {provider, username, password} -> sets session cookies
POST /api/auth/ws-ticket      -> {ticket, ttl_seconds: 30}      (auth-required)
WS   wss://<host>/api/ws?ticket=<ticket>
```

A password provider is not OAuth and not Basic auth: the credential is POSTed once and the gateway
issues a session cookie. Desktop runs this in the Electron main process; the mobile client has to
run it inside a WebView.

## Why the mobile client could not simply do the same

Two independent walls, both confirmed by measurement against the live gateway:

1. **CORS origin allowlist.** `hermes_cli/web_server.py` registers
   `allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"`. A request from
   `capacitor://localhost` (Capacitor's default iOS origin) gets no CORS headers at all, while
   `http://localhost` is answered.
2. **No cross-origin credentials.** The middleware sets no `allow_credentials`, so the response
   carries no `access-control-allow-credentials` — a WebView `fetch` could not send or accept the
   session cookie even if the origin were allowed.

Desktop is unaffected by either because Electron's main process makes the requests, where CORS does
not apply. That is the whole reason the two clients behaved differently.

## The mechanism that made it work

The project already routed REST through **`CapacitorHttp`** (`mobile-gateway-rest.ts`), i.e. the
native HTTP layer, which is not subject to CORS. The remaining question was whether the session
cookie would survive between requests — verified by reading the native implementation rather than
assuming:

```swift
// node_modules/@capacitor/ios/.../CapacitorCookieManager.swift
// Sync WKWebView Cookies to HTTPCookieStorage
HTTPCookieStorage.shared.setCookie(cookie)
```

`HTTPCookieStorage.shared` is a process-wide jar, not an ephemeral session, so the cookie set by
`password-login` is attached to the subsequent `ws-ticket` call. **The user's successful sign-in on
hardware is the confirmation of this.**

The WebSocket still cannot carry a cookie (the WS API sets no headers), which is exactly why the
gateway exposes a single-use ticket and why `mobile-gateway-transport.ts` already had a
`?ticket=` branch waiting for a caller.

## Implementation

| File | Change |
| --- | --- |
| `mobile-gateway-rest.ts` | Added `post()`; three auth shapes now share the transport — LAN token, PKCE bearer, and dashboard-login (no header at all, cookie supplied natively). Allowed `/auth/` paths alongside `/api/`. |
| `mobile-remote-login.ts` (new) | `listPasswordProviders` / `signIn` / `mintWsTicket`. Maps 401/404/429/503 to actionable copy and never echoes the server body. |
| `ipad-home.tsx` | Secure-mode sign-in form (username, password, reveal toggle) and `connectRemoteGateway`: discover provider → sign in → mint ticket → connect. |

**The password is never persisted.** It lives in component state only; the sole durable artefact is
the gateway's own session cookie, held by the native layer. Nothing is written to the credential
store for this path.

**A ticket is minted per attempt** — they are single-use and expire in 30s, so caching one would
guarantee a stale-ticket failure on reconnect.

## Verification

- `npm run typecheck` clean.
- Mobile suite: **12 files / 66 tests**, including 11 new cases (provider filtering, credential
  POST shape, the 401/404/429/503 mapping, non-echo of server errors, ticket minting, ticket
  absence, and the reveal-toggle value preservation).
- **On hardware, by the user: sign-in succeeds against `https://api.wei-agent.com`.**

## Not claimed

- Session listing, transcript rendering, and message sending through this remote connection were
  not separately confirmed — the user reported a successful sign-in, which is what this change
  covers.
- Cookie TTL and re-login behaviour across app restarts were not exercised; the sign-in form stays
  reachable after a disconnect, so re-authentication is possible but its exact trigger is unproven.
- The OAuth/PKCE branch of the secure mode remains unimplemented (this gateway uses a password
  provider).
- `Validate connection` still only parses the address and sends no request — it will report
  "validated" for a gateway that is unreachable. Known false positive, proposed fix outstanding.
