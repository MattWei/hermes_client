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

## Verification

- [x] List → session round-trip on the iPad simulator (back transition still unit-test only).
- [x] Session list appears after connecting, with no manual refresh.

## Notes

- Phases A, A2 and B are complete on iOS; see the evidence files listed in `evidence/`.

- Phase A shipped: see `evidence/phase-a-navigation-validation.md`.
- The technical spike that gates phase B is complete:
  `evidence/mobile-markdown-renderer-spike.md`.
- Phase A is independently shippable: it fixes the "connected but nothing happened" experience
  without touching rendering.
