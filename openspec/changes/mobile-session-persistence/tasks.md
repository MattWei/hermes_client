# Tasks — mobile-session-persistence

## 1. Diagnose the sign-out

- [x] 1.1 Read the gateway state handler: `closed`/`error` called `resetGatewayState(...)`, which nulls the
      gateway and drops to the connection form. iOS suspending the app is enough to trigger it.
- [x] 1.2 Confirm the mount path consulted only `readAutoLogin()`, which is written only when the
      "sign in automatically next time" box is ticked — so a cold start with a live cookie also landed on
      the form.
- [x] 1.3 Confirm `POST /api/auth/ws-ticket` renews on the existing cookie without a password
      (`mobile-remote-login.ts`).

## 2. Reconnect instead of signing out

- [x] 2.1 `recoverConnection()`: platform credential → stored password → form, in that order, one at a time.
- [x] 2.2 `resumeWithCookie()` re-dials both modes: the LAN token, or a WS ticket minted off the cookie.
- [x] 2.3 Keep the connected shell mounted while reconnecting; the status line shows `Reconnecting…`.
- [x] 2.4 `visibilitychange` re-dials too — iOS may never deliver the close event for a suspended socket.

## 3. Remember the address

- [x] 3.1 `mobile-last-connection.ts` persists the gateway address in `localStorage` (a host is not a secret).
- [x] 3.2 A launch with no stored password tries that address with the cookie before showing the form.
- [x] 3.3 Sign-out forgets the address, so an explicit sign-out is not undone by a relaunch.

## 5. Media in a conversation

- [x] 5.1 An mp3 rendered a broken player ("错误") and an "Open audio file" link that did nothing. The
      shared resolver fell through to `file://…`, which iOS cannot load, and the open link needed the
      Electron bridge. `evidence/session-audio-playback.md`.
- [x] 5.2 `lib/media.ts` grew one loader seam (`setMobileMediaLoader`) consulted by both the display and
      playback resolvers, so images and video share the fix.
- [x] 5.3 `mobile-media.ts` fetches `GET /api/files/stream?path=…` through `CapacitorHttp`
      (`responseType: 'arraybuffer'`) and returns an object URL; LAN sends the session token header, secure
      rides the cookie. Registered on connect, cleared on disconnect.
- [x] 5.4 On a mobile surface the failed-media state shows the reason instead of an inoperable open button.
- [x] 5.5 `mobile-media.test.ts` 7 cases; mobile suites 29 files / 264 tests, `tsc` clean.
- [x] 5.6 Device check (iPhone 13 Pro / iOS 18.3.2): the drill clips play. Two rounds were needed — the
      first still failed because `CapacitorHttp` returns an `arraybuffer` body as a base64 string, which
      became a zero-byte blob. The server access log (`200`, exact byte counts) is what proved the request
      was never the problem.

## 4. Verification

- [x] 4.1 `ipad-home.test.tsx`: the socket closing reconnects (`connectGateway` twice, no "connection
      lost" copy); the form appears only when the cookie is refused **and** no password is stored.
- [x] 4.2 54 tests in that file, `tsc --noEmit` clean.
- [x] 4.3 Device check (iPhone 13 Pro, iOS 18.3.2): open a conversation, background the app, return —
      the same conversation is on screen with its transcript, no sign-in form, no empty state. Separately,
      `logout` still returns to the form and does not reconnect on the next launch.
