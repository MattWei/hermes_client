# Desktop-shaped shell: collapsible session sidebar

Date: 2026-09-13
Change: `mobile-sessions-navigation`

## Motivation

Requested after phase A: the connected mobile client should look like Hermes Desktop — the
session list in a left sidebar, collapsible — instead of a list page that replaces itself with a
detail page.

## Investigation: what is actually reusable

The desktop session sidebar is not one component. Measured:

| Part | Size | Verdict |
| --- | --- | --- |
| `app/chat/sidebar/index.tsx` | 1,922 lines; 50 files in the directory | **Not reusable** — imports `react-router`, `@dnd-kit`, `@/hermes` (`searchSessions` over IPC), the plugin registry, and desktop stores (`connections`, `cron`, `keybinds`, `notifications`) |
| leaf rows — `session-row.tsx` (633), `sessions-section.tsx` (542), `virtual-session-list.tsx` (222) | 1,400+ lines | **Not reusable as-is** — each pulls `useI18n` plus desktop stores and dnd-kit |
| `components/ui/sidebar.tsx` | 676 lines, full primitive set | **Reusable** — no IPC, no react-router, no dnd-kit, no desktop stores |

`components/ui/sidebar.tsx` exports `SidebarProvider`, `Sidebar` (`side`, `collapsible`),
`SidebarHeader/Content/Footer`, `SidebarGroup*`, `SidebarMenu*`, `SidebarInset`, `SidebarRail`,
`SidebarTrigger` and `useSidebar` — and desktop's own `chat/sidebar/index.tsx` is built on exactly
these primitives. It already carries the collapse implementation
(`state: 'expanded' | 'collapsed'`, `toggleSidebar`).

`useIsMobile` (used by the provider) reads `matchMedia` defensively, so it degrades silently in
jsdom and anywhere the API is missing.

## Decision

Reuse the **layout primitives**; build the **list content** for mobile.

- **Reused:** `components/ui/sidebar` — same primitives, same collapse behaviour, same visual
  language as desktop.
- **Not reused:** the desktop sidebar's content layer (projects, profile rail, fleet rail, cron
  section, drag reordering, virtual scrolling) — none of it has a mobile backend, and it would
  drag the desktop store graph into the mobile entry.
- **Still out of scope:** the desktop pane tree / multi-session tiling.

## Implementation

`src/ipad-shell.tsx` **(new)**: `SidebarProvider` + `Sidebar collapsible="offcanvas"` holding the
session list, with connection status and `Disconnect gateway` in the footer; `SidebarInset` holds
the action header (`SidebarTrigger`, `Start new session`, `Refresh sessions`) and the open
session.

`ipad-home.tsx` now returns two surfaces: the offline connection page (unchanged) and, once
connected, the shell. The welcome block is not rendered while connected, so the shell owns the
full viewport. The detail view lost its `Back to sessions` button — with the list permanently
beside it there is nothing to go back to.

`ipad-session-list.tsx` was removed; the shell's sidebar supersedes it.

## Verification

```text
npm run test:ui   → 11 files / 50 tests passed
npm run typecheck → exit 0
build:mobile      → 1.0 MB / 5 chunks      (was 276 KB / 4 chunks)
```

Contract updates, all intended: the connected state no longer renders the welcome/status block or
session previews in the list; `Back to sessions` is gone; the navigation test became "keeps the
session list in the sidebar while a session is open".

Simulator (probe-driven, removed afterwards):

```text
sidebar-state=expanded | sessions-label=true | disconnect=true
open-buttons=1 | inset-empty=true
PHASE 2: sidebar=collapsed | triggerWorked=true
```

Screenshots: `desktop-shell-sidebar-expanded.png`, `desktop-shell-sidebar-collapsed.png`.

## Issue found and fixed during verification

**The sidebar header collided with the iOS status bar.** The shell is full-bleed and had no inset.
`env(safe-area-inset-top)` evaluated to `0` — the Capacitor viewport meta has no
`viewport-fit=cover` — so `max(0.75rem, env(...))` resolved to 12px, which is not enough. Fixed by
using the same `max(1.5rem, env(safe-area-inset-top))` strategy the offline view already used.

## Follow-up: session actions moved into the sidebar

Requested after the first shell pass:

- `Start new session` and `Refresh sessions` moved from the inset header **into the sidebar, above
  the `Sessions` list** — rendered as `SidebarMenuButton` rows so they match the list's visual
  language.
- The inset header is now the **open session's title bar**: it shows the session title from the
  loaded list, `Untitled session` when the row has no title, and `No session selected` while
  nothing is open.

`IpadShell` gained an `activeTitle` prop; `ipad-home.tsx` derives it from the active session id
plus the session list.

**Test impact:** the existing action-button assertions still pass — the buttons moved, their
accessible names did not. Added: `Start new session` is present, and the title bar reads
`No session selected` before a session is opened.

**Simulator verification** (probe, removed afterwards):

```text
PHASE 1 (no session open): start=sidebar | refresh=sidebar | header-title=No session selected
PHASE 2 (session open):    start=sidebar | refresh=sidebar
                           header-title=查看project目录里的openspec, skills, 查找hermes client...
                           messages=7
```

Screenshot: `shell-layout-actions-in-sidebar.png`.

**Re-verified:** 11 IpadHome tests pass (50 across the mobile suite), typecheck exit 0.

## Follow-up: brand block removed from the sidebar header

Requested after the action buttons moved up: the `Hermes` / `Your remote workspace` block at the
top of the sidebar is gone. `SidebarHeader` now starts with the two action rows, so the sidebar's
first line is `Start new session`.

The offline connection surface keeps its own `Hermes` heading — only the connected shell changed.

**Simulator verification** (probe, removed afterwards):

```text
sidebar-top-lines=["Start new session","Refresh sessions","Sessions","查看project目录里的openspec, ..."]
brand-visible=false | hermes-heading=0
```

Screenshot: `shell-no-brand-header.png`.

**Re-verified:** 11 IpadHome tests pass (50 across the mobile suite), typecheck exit 0.

## Polish pass: message bubbles, table overflow, sidebar rows

Three adjustments after reviewing a fully-populated session on device:

| Change | Before | After |
| --- | --- | --- |
| Message alignment | both roles left-aligned at full width — `MarkdownTextContent` renders `w-full`, so `self-end` had nothing to push against | user messages are a right-aligned bubble (`max-w-[85%] self-end`); assistant messages stay `self-start`, unbordered |
| Wide tables | the markdown container's `overflow-hidden` clipped the right edge | `[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto` |
| Sidebar rows | title + preview line | single title line — the data source returns the same text for both, so the second line was pure duplication |

**Measured on device** (probe, removed afterwards):

```text
articles=11
0:flex-start/maxW=100%/bg=none | 1:flex-start/maxW=100%/bg=none | 2:flex-start/maxW=100%/bg=none | 3:flex-end/maxW=85%/bg=yes
overflowing-articles=none
table=auto sw=784>cw=784
```

**Three screenshot misreadings, recorded so they are not repeated:**

1. A long code line looked "clipped". It was not — `pre` carries `overflow-x: auto` and the line scrolls; only the table was genuinely clipped.
2. A uniformly-coloured code block looked like "highlighting failed"; it simply had no language annotation.
3. A leftward content offset in the final capture was the probe's own `scrollIntoView` (default `inline: 'nearest'`), not a layout defect.

Lesson: on a narrow WKWebView a screenshot cannot distinguish "clipped" from "scrollable". Compare `scrollWidth` vs `clientWidth` per element instead.

## Polish pass 2: session-open loading feedback

Opening a session previously did nothing visible until the resume round-trip returned — the tap
felt dead for the length of a REST + WebSocket exchange.

**Change:** `openStoredSession` / `startNewSession` now switch to the detail view and set a
loading flag *before* awaiting the gateway, and clear it in a `finally`. A failure returns to the
list rather than stranding the user on a blank detail view.

```text
view === 'session' && sessionLoading   → "Loading session…" (role="status")
view === 'session' && !sessionLoading  → the session detail
view !== 'session'                     → "Select a session, or start a new one."
```

**Test:** added `shows a loading state while a session opens, then the transcript`, which parks
the resume promise on a `deferred()` so the pending state is asserted deterministically and then
released. Suite: 11 files / **51** tests.

**Device check:** the connected shell renders correctly — sidebar selection highlight, title bar,
transcript (`polish-loading.png`). The loading frame itself is too short-lived to capture against
a localhost backend; the deferred-promise unit test is the evidence for that state.

## Feature pass: session search and date grouping

Requested as the "desktop sidebar parity" items.

**Data layer** — `MobileSessionListItem` gained `updatedAt` (seconds). Derivation is `last_active`
falling back to `started_at`; the backend already returns both, but the mobile list dropped them,
so the sidebar had no time information at all and grouping was impossible without this.

**Reused rather than reimplemented:**

- `calendarBucket` + `sessionBucketLabel` from `lib/time.ts` — that module has **no imports at
  all**, so it is fully platform-neutral.
- `SearchField` from `components/ui/search-field.tsx` — its dependencies (Button / Codicon / Tip /
  i18n) were already in the mobile graph via the sidebar primitives.
- Date labels come from `t.sidebar.dateDivider`, the same i18n keys the desktop sidebar uses.

**Not reused:** the desktop `sessionMatchesSearch` and `session-date-groups` are typed against the
desktop `SessionInfo` and pull `chat-runtime` / `session-branch-tree`. The mobile list is a
three-field shape, so matching is a three-field comparison instead — smaller than the adapter it
would have taken to reuse the desktop predicate.

**Tests:** a new case covers filter → no-match → restore and asserts the grouped list renders
headings; a client-adapter case proves `last_active` wins over `started_at` and that a session with
neither yields `updatedAt: null`. Mobile suite: **11 files / 53 tests** (was 50).

**Device verification** (probe, removed afterwards):

```text
search-input=found | groups=1 | rows=1
search zzzz -> rows=0 | search "openspec" -> rows=1 | cleared -> rows=1
```

Screenshot: `sidebar-search-and-date-groups.png` — the sidebar shows the search field and an
"Earlier today" group heading. The test backend holds a single session, so the multi-group path is
covered by the unit test rather than by the screenshot.

## Cost

The `components/ui/sidebar` closure is ~100 local files and entered the **cold-start** path
(unlike shiki, which stays lazy). Bundle grew 276 KB → 1.0 MB. Accepted deliberately: the shell is
the primary connected surface, so deferring it would trade a flash of empty layout for the same
bytes.
