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
- [x] N8 **The recording leg works inside WKWebView.** The user's tap produced a real upload, which
      settles the genuinely uncertain part: `getUserMedia` + `MediaRecorder` run in the iPad WebView,
      and Capacitor's blanket `.grant` is what lets them. Failures still land on the status line, so
      the same tap doubles as the diagnosis.
- [x] N9 Height, clearance and surface, from the user's read of it **on the device**: the pill's padding
      comes down (container `px-2.5 py-1`, textarea `py-1.5`, both round buttons `p-2`) taking the row
      from ≈64px to ≈44px, the form gains `pb-[max(1.5rem,env(safe-area-inset-bottom))]` so the pill no
      longer sits against the viewport edge, and the fill moves from the translucent
      `--ui-bg-quaternary` to `bg-background`. `--ui-bg-input: #fcfcfc` exists but is unused and a fixed
      light value — a white block in a dark theme — so it was not the right token for "white".
- [x] N10 The pill gains a hairline border (`--ui-stroke-tertiary`) and the `+` control loses its own —
      offered when the white fill turned out to be too quiet to read as a surface, and confirmed by the
      user. The pill is the box; a bordered icon inside a bordered box read as two boxes.
- [ ] N11 **The gateway cannot transcribe at all — the host has no usable STT provider.** The route's own
      message, surfaced by N12, reads: *stt is configured to use nous (set via hermes tools), but the
      nous tool gateway is not available*. Inspected on the backend host (`api.wei-agent.com` =
      `8.218.14.48`, reachable over ssh):
      - `~/.hermes/config.yaml` says `stt.provider: openai`, but `hermes-gateway.service` **started
        Oct 11 23:20** while that file was **edited Oct 13 22:51** — so the process still serves the
        older value (`nous`). Nothing hot-reloads it, which is why the edit appeared to do nothing.
      - A restart alone would not fix it: **no STT credential of any kind is present** (OpenAI,
        ElevenLabs, Mistral, Deepgram, Groq, Nous — none in `.env`, none in the process environment),
        and `faster_whisper` is not installed in the gateway venv, so `provider: local` is out too.
      Every option therefore needs something added to the backend first, and that is the user's call:
      the client half of this path is done and proven.
- [x] N12 **The client was throwing the diagnosis away.** It reported `Transcription failed (HTTP 400)`,
      which cannot distinguish an empty recording from a gateway with no STT provider from an
      undecodable container — and the route answers `{"detail": "<why>"}`, whose text *is* the
      diagnosis. Now surfaced, with the status as the fallback when the body is not JSON.

## Phase O — on-device dictation (spike)

- [x] O1 Prefer the device's own recogniser over a gateway upload. The gateway transcribes only through
      a configured STT provider, and the backend host has none, so the microphone button had nothing to
      reach. The iPad carries a Mandarin model, runs it for free and sends the audio nowhere.
- [x] O2 New native plugin `ios/App/App/SpeechPlugin.swift` (`SFSpeechRecognizer`, on-device):
      `available` / `requestPermission` / `start` / `stop`, registered app-side from
      `MainViewController` exactly as `SecureStorePlugin` is. Requires **four** `project.pbxproj`
      entries — a Swift file on disk but absent from the target compiles to nothing and reports nothing.
- [x] O3 `Info.plist` gains `NSSpeechRecognitionUsageDescription`; without it the first call terminates
      the app rather than prompting.
- [x] O4 The gateway upload stays as the fallback, selected by a capability probe, so Android and every
      other platform keep a working button instead of a dead one. The status line names which engine is
      live (`Listening on this device…` vs `Recording…`), so a tap is decodable without a debugger.
- [x] O5 **Verified on hardware by the user**: tapped the microphone, spoke, and the words appeared in
      the composer. The device recogniser works, so the feature no longer depends on the backend having
      an STT provider at all.
- [x] O6 Partials stream into the composer as the person speaks, through the plugin's existing `partial`
      event: watching the words appear is the point of a device recogniser, and a mis-hearing becomes
      visible while it can still be corrected. The listener is detached on stop — one that outlives its
      recording keeps writing into an editor the person has left — and the transcript joins the draft
      that stood there when recording began, so dictating twice appends instead of eating the first half.

## Phase P — model and thinking selectors

- [x] P1 Two selectors above the input, on the user's ask: the model name and the thinking level, each
      with a chevron, opening a list upward. Labels come from the desktop's own pure modules
      (`lib/model-status-label`, `lib/reasoning-effort`) so `Med` means what it means on the desktop —
      a second formatter is how the session-label bug started.
- [x] P2 `mobile-model-client.ts` over the gateway's real contract: `model.options` for the catalog,
      `config.get { key: 'reasoning' }` for the profile level, `config.set { key: 'model' }` and
      `config.set { key: 'reasoning' }` to change them. The key is `model`, not `agent.model` — the
      backend matches `_CONFIG_SETTERS` exactly — and it answers 4001 without a live session, which is
      why the pills live in the session detail rather than the list.
- [x] P3 **Expensive models need two taps**, the user's choice: the first changes nothing and shows the
      gateway's own `confirm_message`; the same model tapped again sends `confirm_expensive_model`.
      A test asserts that parameter is absent from a first pick — a single tap that quietly spends
      money is this control's worst failure mode.
- [x] P3a **The provider travels with the model** (reported on hardware: `Model was not found in this
      provider's model listing`). The first cut flattened the catalog and sent a bare id, but the
      resolver searches one provider's listing — the backend's own guard comment says a bare pick
      resolves against the *live* provider. The switch now sends `<model> --provider <slug>`, and the
      menu groups by provider because the group is the other half of the pick. The confirmation is
      keyed on `provider/model`, so confirming one provider's model cannot confirm another's.
- [ ] P4 **Verified on hardware**: the pills show the live model and level, and each list changes it.
      Contract and reasoning: `evidence/composer-selectors.md`.
- [x] P9 **The sidebar footer is a status line, not a log** (user's ask, with the desktop's own bar as
      the model). It now carries the profile picker (taller, as asked) plus `globe` + gateway host +
      backend health, read from `GET /api/status` `gateway_platforms` — the same rollup behind the
      desktop's "Backend weixin down". `connectionMessage` moved under the session title rather than being
      deleted, so errors stay visible. `evidence/sidebar-status.md`.
- [x] P10 **The session list is draggable, capped at 90% of the screen** (user's ask). A grip on the
      right edge drags the rail; the width is written to the primitives' `--sidebar-width` so the panel,
      its gap and the inset stay in agreement, and transitions are suppressed mid-drag (the primitive
      animates width, which lags a finger). `clampSidebarWidth` caps at 90% of the **viewport**, and that
      ratio outranks the 180px comfort minimum — "never fills the screen" has to hold unconditionally.
      Not persisted across launches (nothing asked for; a stored pixel width is what breaks on rotation).
      `evidence/sidebar-resize.md`.
      **Confirmed on hardware** after the `min-w-0` fix: the rail widens and the conversation narrows
      with it (user: "已经正常缩小").
- [x] P10a **A drag must not become a text selection.** Repeated resizes left a highlight block at the
      bottom of the rail with the profile picker and status line hidden — WebKit's native selection, which
      `touch-none` does not prevent. `preventDefault` + `select-none` + `-webkit-touch-callout: none` on
      the grip, `select-none` across the shell while dragging, and `removeAllRanges()` at both ends. Width
      updates are coalesced to one per animation frame, and the footer is `shrink-0` so the list cannot
      squeeze it out.
- [x] P9a **The footer reports the connected backend only** (settled with the user after two wrong cuts:
      platform-as-headline, then platform-as-muted-detail). `gateway_platforms` is no longer parsed at
      all — `Backend ready` / `Backend stopped` / `<state>`, or nothing when the payload does not say.
      A failed messaging adapter is a different audience's problem, and the connection is already proven
      by the surface being on screen.
- [x] P8 **A profile switch re-arms the last-session restore.** `selectProfile` cleared the session
      state but left `restoreAttempted` (a one-shot) and `activeSessionRef` in place, so the new profile
      never asked for its own session and landed on an empty list. Switching profile is a workspace
      switch: clear the session state, empty the ref, re-arm the restore, and clear the model pills —
      a profile has its own default. Covered by a test that switches to a second profile and asserts the
      transcript it resumes is that profile's.
- [x] P7 The catalog is asked **on behalf of the session** (`model.options { session_id }`). Asked
      without it the gateway answers for the profile default, so a session pinned to another model had
      no row to tick and its row looked like it never contained the model. Verified against the live
      backend both ways: with the session override the row regains `deepseek-v4-flash`. This matters
      because existing sessions keep the model they were created with, and one of them is pinned to an
      id DeepSeek no longer lists.
- [x] P6 **The pill follows the session, not the profile** (reported: switch model → kill the app →
      reopen → the pill shows the OLD model while the agent answers as the new one). `model.options`
      reports the *configured* model; the session override lives in `session.resume`'s `info`
      (`_session_info`: `model` / `provider` / `reasoning_effort`). `resume()` was dropping it. It now
      carries `info` out, `readSessionModelInfo` parses it, and the catalog effect reads
      `current.model || options.model` so it can never overwrite a session's own pick. Same path as the
      desktop (`SessionResumeResponse.info` → `sessionState.model`). A new session clears the pills,
      since it runs on the profile default.
- [x] P5 The list **opens on the pick in force**, marked with a check (`menuitemradio` +
      `aria-checked`, so the mark is real rather than a style). It scrolls itself to that row instead of
      calling `scrollIntoView`, which walks every scrollable ancestor and would drag the transcript —
      the desktop's `trigger-popover` says so in as many words, so the mobile panel does the same rect
      arithmetic on its own `scrollTop`. Keyed on `provider/model`: two providers can list the same
      model name.

## Phase Q — device-only paint failures

- [x] Q1 **The composer's model and thinking controls were invisible on device** (reported after the
      sidebar work). They existed, hit-tested and measured `135x42` with opacity 1 — and drew nothing.
      Cause: an `overflow-x-hidden` I had added to `SidebarInset` while fixing the resize; it turns the
      pane into a scroll container and WebKit stopped painting static descendants inside it. Removed —
      `min-w-0` was the real fix for the width problem. `evidence/webkit-paint-failures.md`.
- [x] Q2 **A dropdown that opens upward over a scrolling list is not painted.** `absolute bottom-full`,
      `z-index: 50`, a stacking context on the footer — none of it helped. The list now renders through a
      portal into `document.body` as a fixed-position layer, which has no scrolling ancestor.
- [x] Q3 The "close on scroll" listener closed the menu on its own programmatic scroll-to-current-row.
      Removed; outside tap and Escape remain.
- [x] Q4 The rail went in-flow (`relative!`) and the now-dead re-raster mitigation was deleted rather
      than left behind with a false premise.

## Phase R — the surface on a phone

- [x] R1 iPhone 13 Pro simulator (iOS 26.5) reached the login form, then the shell, on a loopback build.
      `evidence/phone-layout.md`.
- [x] R2 "The session list is gone below 768px" was wrong: the primitive renders a **Sheet drawer** there,
      so `[data-slot=sidebar]` is absent until the header trigger is pressed. Measured, not assumed:
      `win 390x844 md=false / sidebar: absent / inset: 0,0 390x844`.
- [x] R3 `index.html` gained `viewport-fit=cover`. Every `env(safe-area-inset-*)` in the shell was already
      written and resolving to 0 — measured `top=47px bottom=34px` after the change, header 69→92px.
- [x] R4 The drawer covered the session it had just opened. `CloseDrawerAfterPick` closes it on a
      delegated click inside a `sidebar-menu-item`, mobile only — one listener for sessions, "start new
      session" and "refresh".
- [x] R5 Regression: 21 files / 179 tests pass, `tsc --noEmit` clean, clean build installed and verified
      by screenshot (header below the status bar, composer and its pills above the home indicator).

## Phase S — reading a resumed session

- [x] S1 A resumed conversation opens at its **last** message. The transcript's own `scrollTop` is set
      from `scrollHeight` when the session id changes, and again as its messages arrive — never
      `scrollIntoView`, which moves every scrollable ancestor. `evidence/session-open-scroll.md`.
- [x] S2 A person who scrolled up is left alone: `followTail` is derived from the container's own
      `onScroll` (within 48px of the bottom), so a completed turn does not yank the view back.
- [x] S3 Regression test: switching session ids expects `scrollTop === scrollHeight` (jsdom has no
      layout, so this covers the wiring; the visual check is on the device).

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
