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
- [x] J3 Consequence: the cookie survives an app relaunch **and a backend restart**, so
      "re-login after restart" was never the behaviour. The only expiry is the 30-day window.
- [x] J4 **Fix**: `list()` never checked `response.ok`, so an expired cookie surfaced as
      `Hermes returned an invalid session list` — a server-fault message for a condition the user
      can act on. 401/403 now raise `MobileSessionAuthError`.
- [x] J5 Retry once with the stored credentials when that error appears; fall back to the
      actionable message only when nothing is stored.

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
