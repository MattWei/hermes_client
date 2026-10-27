## Why

On the phone, sending the app to the background and opening it again lands on the sign-in page. The
connection survives nothing: the socket drops when iOS suspends the app, and the surface treats a dropped
socket as "signed out" even though the gateway session cookie is still valid.

## What Changes

- Reconnect silently when the gateway socket drops, using the session cookie that is already in the
  platform cookie store — no password re-entry.
- Reuse the last connected address on launch, so a cold start reconnects without credentials too.
- Keep the connected shell on screen while reconnecting; fall back to the sign-in form only when the
  cookie is genuinely refused and there are no stored credentials.

## Capabilities
### New Capabilities
- `mobile-session-persistence`: staying signed in across backgrounding, suspension and relaunch.

## Impact

`apps/desktop/src/ipad-home.tsx` (connection lifecycle), the mobile credential store (address
persistence), and the gateway state handler that currently resets the whole surface on `closed`.

Status: investigating — see evidence/ for what the current code does.
