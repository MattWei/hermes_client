# Staying signed in across a backgrounded app

Reported: send the app to the background, open it again, and the person is at the sign-in page.

## What actually happens

The sign-in is not what expires — the **socket** does, and the surface treated that as a sign-out.

`ipad-home.tsx` subscribed to the gateway socket and, on `closed`/`error`, called `resetGatewayState(...)`,
which nulls the gateway and drops the whole surface back to the connection form:

```ts
return gateway.onState(state => {
  if (state === 'closed' || state === 'error') {
    resetGatewayState('Gateway connection lost.')   // ← the login page
  }
})
```

iOS suspends the entire app when it goes to the background, and a suspended WebSocket is simply gone. The
dashboard session cookie is unaffected: it lives in the platform cookie store and is good for 30 days of
refresh. So the app threw away a perfectly valid session because the transport under it died.

The second half of the bug is reach: on relaunch the mount effect consulted `readAutoLogin()` only, and that
is written **only when the "sign in automatically next time" box is ticked**. With the box unticked there
was nothing to consult, so a cold start also landed on the form even though `POST /api/auth/ws-ticket`
would have answered the existing cookie with a fresh ticket.

## What changed

- **A dropped socket reconnects.** `recoverConnection()` tries, in order: the credential the platform
  already holds (LAN token, or a minted WS ticket off the dashboard cookie), then the stored password
  (`reauthenticate()`), and only then `resetGatewayState('Gateway connection lost. Sign in again.')`.
- **The address is remembered** (`mobile-last-connection.ts`, `localStorage`, not the Keychain — a host is
  not a secret), so a cold start with a live cookie reconnects without a password.
- **`visibilitychange` also re-dials.** iOS may never deliver the close event for a socket that died while
  suspended, so returning to the foreground checks instead of waiting.
- **Signing out still signs out.** `disconnectGateway()` sets `signedOut` before closing the socket (so the
  close it causes is not answered with a reconnect) and forgets the remembered address.

## Verification

`ipad-home.test.tsx`:

- the socket closing is a **reconnect**: `connectGateway` is called twice and "Gateway connection lost."
  never appears;
- the form appears only when the cookie is refused **and** no password is stored.

53 tests pass in that file; `tsc` clean.
