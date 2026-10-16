# Tasks

## Phase A — navigation and views (plain-text transcript)

- [x] A1 Split the mobile entry into a view model (`list` ⇄ `session`) with back navigation and no
  router library.
- [x] A2 Extract the session detail view from `ipad-home.tsx` (transcript, composer, approval
  card, tool activity) without changing its behaviour.
- [x] A3 Add the session list view (title, preview, refresh, new session) driven by
  `createMobileSessionClient(...).list()`.
- [x] A4 Load the session list automatically after a successful gateway connect (removes the
  manual `Refresh sessions` step).
- [x] A5 Keep the connection surface reachable from the list view: the connection form is hidden
  once connected, leaving a status chip, a disconnect row and the latest status message.
- [x] A6 Tests: navigation round-trip, auto-load on connect, list → detail → back.
- [x] A7 Regression: the existing mobile suite stays green (11 files / 50 tests; was 49).
- [x] A8 Simulator verification on iPad (A16) with screenshot evidence —
  `evidence/phase-a-navigation-validation.md`.

## Phase A2 — desktop-shaped shell (follow-up)

- [x] A2.1 Reuse `components/ui/sidebar` primitives for the connected layout (`ipad-shell.tsx`).
- [x] A2.2 Collapsible left session sidebar; the open session renders in the inset.
- [x] A2.3 Hide the welcome/connection surface entirely while connected.
- [x] A2.4 Drop `Back to sessions` — the list is permanently beside the session.
- [x] A2.5 Tests updated to the shell contract (11 files / 50 tests); typecheck clean.
- [x] A2.6 Simulator verification of expanded and collapsed states with screenshots.
- [x] A2.7 Session actions (`Start new session` / `Refresh sessions`) moved into the sidebar above
  the list; the inset header became the open-session title bar; the sidebar brand block was
  removed so the action rows are the first thing in the sidebar.
- [x] A2.8 Session-open loading feedback (`Loading session…`, role=status) with a deferred-promise
  test; failures return to the list instead of stranding a blank detail view.
- [ ] A2.9 Android regression for the shared mobile entry. Its evidence predates the shell,
      composer, connection-layer, sign-in and validation changes, so it must be re-run rather than
      assumed to still hold.

## Phase B — rich transcript rendering (gated on A)

- [x] B1 Render transcript text through `MarkdownTextContent` (design decision 2).
- [x] B2 Preserve the `React.lazy` boundary for shiki/mermaid; nothing heavy on the boot path
  (verified from the production bundle: entry chunk references shiki 0 times; only
  `shiki-block` imports it, and only via `React.lazy`).
- [x] B3 Measure bundle delta: startup 1.0 MB → ~2.2 MB; shiki (18 MB) and mermaid (2.8 MB) stay
  lazy and out of startup.
- [x] B4 Highlighter trimming: **decided against**. The lazy load produced highlighted output
  within 10 s in both probe runs; trimming adds configuration risk for a cost that is already off
  the startup path. Revisit only if real-device timing says otherwise.
- [x] B5 Simulator verification: a real stored session rendered 5 messages, 16 code blocks
  (73 token spans, 5 distinct colours = highlighting active) and 2 tables —
  `evidence/phase-b-rich-rendering-validation.md`.

## Phase C — sidebar parity features

- [x] C1 Session search over title / preview / id, reusing the desktop `SearchField`.
- [x] C2 Date grouping via `calendarBucket` / `sessionBucketLabel` with `t.sidebar.dateDivider`.
- [x] C3 Mobile adapter exposes `updatedAt` (`last_active` → `started_at`).
- [x] C4 Tests: filter/restore, grouped headings, timestamp extraction (11 files / 53 tests).
- [x] C5 Device verification with screenshot evidence.

## Phase D — physical device deployment

- [x] D1 Add `NSLocalNetworkUsageDescription` — required on hardware (iOS 14+), unchecked by the simulator.
- [x] D2 Establish the device build path: emulator loopback flag omitted so the client enforces RFC1918-only.
- [x] D3 Characterise the backend Host-header guard; confirm loopback bind + reverse proxy is the supported shape.
- [x] D4 Install on the physical iPad: signed with the personal team, installed via `devicectl`,
      launched after the user trusted the developer profile in Settings → General → VPN & Device Management.
      Connecting to a backend is pending the user's choice of backend address.

## Phase E — remote HTTPS sign-in

- [x] E1 Read the working mechanism off the desktop client: a password provider over the dashboard
      login flow, not Basic auth and not OAuth.
- [x] E2 Diagnose why a WebView could not reuse it: the CORS origin allowlist plus the absence of
      allow-credentials meant neither the origin nor the cookie could cross.
- [x] E3 Extend the REST client with `post()` and a credential-free header shape for cookie auth.
- [x] E4 Implement provider discovery, password sign-in, and single-use ws-ticket minting.
- [x] E5 Add the secure-mode sign-in form with a password reveal toggle.
- [x] E6 Unit coverage for the sign-in path and the reveal toggle (11 cases).
- [x] E7 Confirmed on the physical iPad by the user against `https://api.wei-agent.com`.

## Phase F — connection-surface polish

- [x] F1 Auto-login: opt-in credential in the platform keystore, sign-in at launch.
- [x] F2 Fix the launch pass reading a stale address — auto-login could never have worked.
- [x] F3 A successful unattended launch must not re-arm an unchecked preference.
- [x] F4 **Verified on hardware by the user**: tick → connect → force-quit → relaunch → connected.
- [x] F5 `Validate connection` probes `/api/status` (plus an authenticated `/api/sessions` for LAN)
      instead of reporting a format check as reachability.
- [x] F6 Remove the composer from the disconnected surface — with no session it only rendered disabled.
- [x] F7 Reduce that page to the connection form: promo copy, brand block and status chip removed;
      the emulator safety notice kept and moved above the form.
- [x] F8 Centred wordmark, password reveal moved inside the field as an eye icon, the two primary
      buttons unified and their labels shortened.

## Phase G — session-list correctness (follow-up)

- [x] G1 Label a row by title → preview → placeholder. The backend only auto-titles after a complete
      exchange, so most rows carry a preview and no title; falling straight to the placeholder made
      the list unreadable.
- [x] G2 List with `min_messages=1`, as the desktop sidebar does. `min_messages=0` surfaced every
      abandoned draft as an empty "Untitled session".
- [x] G3 Carry the profile on the calls that need it: `?profile=` on the list and `profile` on
      `session.create`.
- [x] G4 **Fix**: opening a session while another profile was selected showed an empty transcript —
      `session.resume` and the messages route both have to name the profile, or the server looks in
      its own store and finds no such session id.
- [x] G5 Stop sending an invented title on create, matching the desktop ("No title: the backend
      auto-names the branch"). A stored placeholder suppressed the preview fallback permanently.

## Phase H — session management (long-press)

- [x] H1 Long-press a row for a Rename / Delete action sheet; repeat press dismisses it, opening a
      session closes it.
- [x] H2 Detect the press by timing pointer events — WKWebView does **not** deliver `contextmenu`
      for a long press on an ordinary element, and raises the system callout unless
      `-webkit-touch-callout: none` is set.
- [x] H3 Suppress the click that follows a long press, so the action sheet does not also open the row.
- [x] H4 Rename in place: the row becomes an input, because WKWebView does not present
      `window.prompt()`.
- [x] H5 **Route both over REST** (`DELETE`/`PATCH /api/sessions/{id}`), as the desktop does. The WS
      methods resolve through the gateway's in-memory table (runtime ids): `session.title` answers
      4001 for a stored id, and `session.delete` refuses anything still held with 4023.
- [x] H6 **Verified on hardware by the user**: rename and delete both work.
- [x] H7 Pin / Unpin, on the row's durable `pinned` column (`PATCH`), with the pins collected into a
      `Pinned` group above the dated ones — a pin that is not findable without knowing its bucket is
      not a pin.
- [x] H8 Dismiss the sheet on a press anywhere outside it (capture-phase `pointerdown`); a press on
      the owning row is left to the press timer so a second long press toggles it shut.
- [x] H9 A visible `⋯` trigger per row, so the sheet is reachable without discovering the long press.
- [x] H10 Optimistic pin feedback: the row moves on tap, the cache is written in the same breath,
      and a refused write rolls both back. The server row stays authoritative on every list.
- [x] H11 iPadOS never clears `:hover` from the last-touched element, and the list reuses DOM nodes
      as rows reorder — so a stuck hover surfaced as a **second** row painted as selected. Suppress
      hover on non-active rows only (`:not([data-active='true'])`); without the exclusion the
      suppression out-ranks the active styling and the open conversation loses its background.
      No media query: `hover: none` is unreliable on iPadOS, which reports hover for trackpad and
      pointer accessories.

## Phase I — layout

- [x] I1 The transcript scrolls, not the page: a long conversation pushed the composer off screen
      because `min-h-dvh` let the root grow and `overflow-y-auto` sat on the shell instead of the
      message list.
- [x] I2 An empty session keeps the composer at the bottom — with no messages the `flex-1`
      transcript is not rendered, so nothing absorbed the leftover space.
- [x] I3 Swap the profile selector and the disconnect control: selector to the sidebar footer,
      `logout` beside the `Sessions` heading.
- [x] I4 Portrait, confirmed by the user: the iPad is used in portrait as its normal orientation and
      behaves identically to landscape. The earlier "portrait unverified" note was an assumption
      about which orientation mattered, not a gap in the surface.

## Phase J — session lifetime

- [x] J1 Establish what the cookie actually is, from the provider: `HMAC-signed tokens (no IDP, no
      database)`. `verify_session` and `refresh_session` only check a signature over a key read from
      config — there is no server-side session store.
- [x] J2 Timings, read off the provider rather than guessed: access token 12 h, refresh window 30 d,
      and the provider's own comment — "the TTL controls refresh frequency, not login length". The
      dashboard middleware refreshes the access token in the background.
- [x] J3 Consequence: an app relaunch never ends the cookie (it lives in the platform's cookie
      store). A backend restart does **only when `secret` is unset** — `_resolve_secret` then returns
      `secrets.token_bytes(32)` per process, so every restart invalidates existing cookies. With
      `dashboard.basic_auth.secret` configured the cookie outlives restarts. An earlier note here
      claimed restart-safety unconditionally; that was wrong, and the provider logs which case is in
      force at INFO.
- [x] J4 **Fix**: `list()` never checked `response.ok`, so an expired cookie surfaced as
      `Hermes returned an invalid session list` — a server-fault message for a condition the user
      can act on. 401/403 now raise `MobileSessionAuthError`.
- [x] J5 Retry once with the stored credentials when that error appears; fall back to the
      actionable message only when nothing is stored.
- [ ] J6 **Not verified end to end, on purpose.** The retry is covered by unit tests, but no real
      expired cookie has driven it — the cheapest reproduction is to rotate
      `dashboard.basic_auth.secret` on the backend, which invalidates every live client once. The
      user has deferred this; it stays open rather than being recorded as done.

## Phase K — returning to the last conversation

- [x] K1 Remember the open conversation, keyed by profile (a session id is only unique inside one,
      and switching profile is a re-home rather than a scroll).
- [x] K2 Restore it through an effect that waits for the gateway, the REST client and a non-empty
      list — reading `rest` from the list callback was unreliable, because the state may not have
      landed yet and `openStoredSession` would bail on its guard.
- [x] K3 Keep the hint across a sign-out. Logging out drops the connection, not the place; the next
      launch reconnects on its own and should land back where the user was reading. **User's call**,
      after an initial version cleared it.
- [x] K4 Re-arm the one-attempt-per-surface guard on disconnect. It was spent by the first connect,
      so signing in again in the same run landed on the list — the defect the user actually hit.
- [x] K5 Drop the hint only when it can no longer be honoured: the session was deleted, or the id
      failed to resolve. A stale id is never retried on the next launch.
- [x] K6 **Verified on hardware by the user**: relaunch, and sign-out-then-sign-in, both return to
      the conversation.

## Phase L — one session label, two places

- [x] L1 The inset header above the conversation body and the sidebar row disagreed. The row fell
      back title → preview → placeholder; the header fell back title → placeholder only. A session
      the backend never auto-titled therefore read as its preview in the list and as
      "Untitled session" above the body. Auto-titling only fires after a complete exchange, so this
      is the common case, not an edge one.
- [x] L2 Make both call one function (`sessionLabel`, exported from `ipad-shell.tsx`) instead of
      keeping two copies of the same chain — the defect was the copies drifting apart, not the
      chain itself. Mirrors the desktop's single `sessionTitle()` in `lib/chat-runtime.ts`.
- [x] L3 Cover it in `ipad-home.test.tsx`: with a title-less session open, the header shows the
      preview and no "Untitled session" is on the surface. The existing preview test only asserts
      the sidebar row, which is why this slipped through. Confirmed RED against the old code
      (`1 failed | 43 passed`) and GREEN after; see `evidence/session-label.md`.
- [x] L4 A brand-new session has no row — the backend persists one only on the first turn — so the
      chain has to bottom out at the placeholder, not at "no session". The first version of this fix
      got that wrong and made a fresh session's header read as "No session selected"; found by reading
      `startNewSession()` rather than by a test. Covered now, and recorded in
      `evidence/session-label.md`.
- [x] L5 **Verified on hardware by the user**: a title-less session now reads as its preview in the
      inset header as well as in the sidebar row, and a brand-new session keeps a label instead of
      reading as "No session selected".

## Phase M — the launch pass's unhandled rejection (follow-up)

- [x] M1 `npm run test:ui` reported `6 errors` and exited 1 on `ipad-home.test.tsx`. Six tests render
      `<IpadHome />` without a `credentialStore`, so they reached the real `SecureStore` Capacitor
      plugin, which rejects under jsdom; the mount-time auto-login effect had no `catch`, so the
      rejection escaped unhandled. Assertions were never wrong — the exit code was.
- [x] M2 Absorb it in that effect. Not jsdom-only: the read rejects on a device too — the iOS Keychain
      item is `AfterFirstUnlockThisDeviceOnly`, so a launch before the first unlock rejects, and
      `SecureStorePlugin.swift` rejects on any other Keychain error.
- [x] M3 Report it **silently**. The first version wrote the failure to `connectionMessage` and broke
      `reports an unreachable endpoint instead of claiming validation`: a mount-time message can land
      after the message for an action the person just took and overwrite it. Nothing read means no
      auto-login, and the connection form is already the fallback. Recorded in
      `evidence/auto-login-and-validation.md` §4.

## Phase N — the composer input (follow-up)

- [x] N1 Drop the rule between the transcript and the input: `border-t` off the composer form. The
      spacing stays; the divider does not.
- [x] N2 The field starts one row tall and grows with its text — `rows={1}`, height re-measured from
      `scrollHeight` on each change (reset to `auto` first, or the box can only ever grow), capped so
      a long draft scrolls. The height is device-verified only: jsdom reports `scrollHeight` as 0.
- [x] N3 Enter sends; Shift+Enter and an in-flight IME composition keep the newline. The IME guard is
      not academic on a Chinese keyboard — Enter commits a candidate, so a bare key check fires
      half-typed text at the model.
- [x] N4 The attach control is a `+` icon instead of the word `Attach`, still the same `<label>` bound
      to the same file input and still named `Attach file` for assistive use.
- [x] N5 Right-hand control switches on content, **at the user's direction**: the microphone while the
      field is empty, `arrow-up` — the desktop composer's own send glyph — once there is text.
- [x] N6 The microphone dictates: record → `POST /api/audio/transcribe` → the transcript lands in the
      draft, not sent. Chosen as the smallest *real* behaviour, because a mic button with nothing
      behind it is a dead control, and this is the shape the requested layout already implies (record,
      text appears, the arrow replaces the mic). A voice message and the desktop's full voice
      conversation stay open as larger options.
- [x] N7 De-risked statically before writing it: Capacitor 8.5's `WebViewDelegationHandler` already
      answers `requestMediaCapturePermissionFor` with `.grant`, so the WebView-level gate that would
      have silently refused `getUserMedia` is open. `NSMicrophoneUsageDescription` existed but its copy
      described recording *video*; it now says what it is for.
- [ ] N8 **The recording leg on a device — needs one tap from the user.** Unproven: `getUserMedia` and
      `MediaRecorder` inside WKWebView on iPadOS. The recorder asks for `audio/mp4` before WebM
      because iOS cannot produce WebM at all, and any failure lands on the status line with its reason,
      so the tap is the test rather than a guess. Recorded in `evidence/composer-input.md`.
- [x] N9 Height, clearance and surface, from the user's read of it **on the device**: the pill's padding
      comes down (container `px-2.5 py-1`, textarea `py-1.5`, both round buttons `p-2`) taking the row
      from ≈64px to ≈44px, the form gains `pb-[max(1.5rem,env(safe-area-inset-bottom))]` so the pill no
      longer sits against the viewport edge, and the fill moves from the translucent
      `--ui-bg-quaternary` to `bg-background`. `--ui-bg-input: #fcfcfc` exists but is unused and a fixed
      light value — a white block in a dark theme — so it was not the right token for "white".

## Verification

- [x] List → session round-trip on the iPad simulator (back transition still unit-test only).
- [x] Session list appears after connecting, with no manual refresh.

## Notes

- Phases A, A2, B and F–I are complete on iOS; see the evidence files listed in `evidence/`.
- Session-list correctness, profile scoping, layout and the long-press menu — with the two
  verification failures that shaped their method — are in
  `evidence/session-list-and-management.md`.

- Phase A shipped: see `evidence/phase-a-navigation-validation.md`.
- The technical spike that gates phase B is complete:
  `evidence/mobile-markdown-renderer-spike.md`.
- Phase A is independently shippable: it fixes the "connected but nothing happened" experience
  without touching rendering.
