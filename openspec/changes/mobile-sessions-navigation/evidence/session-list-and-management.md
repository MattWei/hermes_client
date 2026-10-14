# Session list, profile scoping, layout and session management

Covers Phase G, H and I. Every result below was measured, not inferred: the numbers come from a
probe reading the live DOM in the simulator against the user's real backend
(`https://api.wei-agent.com`), and the backend contracts from real WebSocket/REST calls against a
local `hermes serve`.

## G — session list correctness

### A row is labelled title → preview → placeholder

The desktop's chain is `session.title?.trim() || session.preview?.trim() || 'Untitled session'`
(`app/artifacts/artifact-utils.ts:54`), and the backend only auto-titles after a **complete**
exchange (`use-prompt-actions/slash.ts:215`). Most rows therefore have a preview and no title.

Before the fix every such row rendered the placeholder. Measured after, in the `shopify` profile:

```
rows=19  UNTITLED=0
labels: 检查shopify网站的运营情况 / shopify / hi / 列出当前会话已加载的所有技能名称 …
```

### `min_messages=1`

`store/session.ts:446` and `use-session-actions/index.ts:668` both explain that the desktop sidebar
lists with `min_messages=1` so an unused draft stays hidden. The mobile client used `0`, which
surfaced every abandoned draft as an empty `Untitled session`. After the change:

```
UNTITLED=0     (measured in both the default and the shopify profile)
```

### Profile scoping — three calls, not one

Selecting a profile re-homes the session list, but the profile has to travel on more than the list:

| Call | Parameter | Why |
| --- | --- | --- |
| `GET /api/sessions` | `?profile=` | rows live in per-profile databases (`_session_db_path_for_profile`) |
| `session.create` | `profile` | the session binds to it at creation |
| `session.resume` | `profile` | **G4** — without it the server searches its own store |
| `GET /api/sessions/{id}/messages` | `?profile=` | **G4** — same reason |

**G4 was a real miss.** The list filtered correctly, so the feature looked done; opening a session
returned an empty transcript because `session.resume` and the messages route were never given the
profile. Measured after the fix, opening the first row of `shopify`:

```
switched -> shopify
rows in shopify: 19
clicked first row
---- CONTENT AFTER OPEN ----
length=13487          ← was 0
Session 20260801_110124_9ac7af resumed.
```

### G5 — no invented title

The client used to send `title: 'New mobile chat'` on create. Stored, it suppressed the preview
fallback permanently. The desktop sends no title (`use-session-actions/index.ts:1890`: *"No title:
the backend auto-names the branch from its parent's lineage."*), and the backend confirms the
placeholder would be pointless (`methods_session.py:453`: *"No drafts: created on the first
prompt"*). The string is now absent from the build output entirely.

## H — session management (long-press)

### Detecting the press

**WKWebView does not deliver `contextmenu` for a long press on an ordinary element.** The press is
therefore timed from pointer events (450 ms), with `-webkit-touch-callout: none` and `select-none`
so the system callout does not cover the action sheet, and a flag that suppresses the `click` which
follows so the sheet does not also open the row.

### REST, not WebSocket

This was the substantive finding of the phase. The WS methods are the wrong surface for acting on a
row the list carries:

| Path | Resolves the target by | Result for a stored id |
| --- | --- | --- |
| `session.title` | `_sessions` in-memory table (**runtime ids**) | `4001 session not found` |
| `session.delete` | `_sessions` membership check first | `4023 cannot delete an active session` |
| `session.close` | `_sessions.pop(sid)` — same runtime-id key | silently `{"closed": false}`, releases nothing |
| **`DELETE /api/sessions/{id}`** | `_resolve_session_id(db, id)` | **works** |
| **`PATCH /api/sessions/{id}`** | `_resolve_session_id(db, id)` | **works** |

Because `session.close` resolves by runtime id it could never release the session that
`session.delete` was refusing — the "close first" workaround was a dead end, not a missing step.

Measured against a local backend:

```
title(stored id)      -> {"code": 4001, "message": "session not found"}
resume                -> runtime = 815e631a
title(runtime id)     -> {"pending": false, "title": "probe-renamed"}
delete while held     -> {"code": 4023, "message": "cannot delete an active session"}
delete (later, freed) -> {"deleted": "20260923_165654_526fdd"}
```

Both operations now go over REST, matching the desktop (`api/sessions.ts:528,536`). The REST client
gained `patch()` and `remove()`, including the native `CapacitorHttp` verb dispatch.

**Verified on hardware by the user**: rename and delete both behave correctly.

## I — layout

`flex-1` children default to `min-height: auto`, so a column only scrolls where the constraint is
actually placed. Three breaks stacked up:

| Layer | Was | Effect |
| --- | --- | --- |
| `main` | `min-h-dvh` | root grew with the transcript |
| `SidebarProvider` | `min-h-svh` | same |
| inset content | `overflow-y-auto` | **the shell** scrolled, taking the composer with it |
| `Conversation` | no `overflow`, no `min-h-0` | expanded instead of scrolling |
| composer | no `shrink-0` | squeezed out |

Fixed so the transcript is the only scrolling region and the composer is pinned:

```
main                    h-dvh overflow-hidden
SidebarProvider         h-svh min-h-0
inset content           flex min-h-0 flex-1 overflow-hidden
IpadSessionDetail       flex min-h-0 flex-1 flex-col
section[Conversation]   min-h-0 flex-1 overflow-y-auto      ← scrolls here
form                    mt-auto shrink-0                    ← pinned
```

Measured on a 10 787 px conversation (`scrollHeight=10787 clientHeight=1010`):

```
composer top=1104 bottom=1168   viewportH=1180   COMPOSER_VISIBLE=true   SEND_VISIBLE=true
```

And on an **empty** new session — where the `flex-1` transcript is not rendered at all, so nothing
absorbed the leftover space (the `mt-auto` case):

```
conversation section present: no (empty session)
composer top=1104 bottom=1168   gapBelowComposer=12   FIXED_AT_BOTTOM=true
```

## Pins, and why the local cache is thin

The desktop reconciles pins with the backend through a 297-line module (`store/session-pin-sync.ts`)
that fences in-flight writes, collapses duplicate rows across profiles, guards re-entrancy and
resets on a connection rescope. **None of that was ported**, because the conditions it defends
against do not exist here: one connection, serial requests, no second writer. Porting it would have
been speculative complexity in search of a problem.

What the mobile client does instead is the part the user actually asked for:

- **Immediate feedback** — the tap reorders the list before the request is issued.
- **A per-profile cache** (`hermes.mobile.pinned.<profile>`) so a relaunch paints the same thing.
  The key carries the profile because a session id is only unique inside one.
- **Server authority** — a list response rewrites the cache from the rows it carries, and a refused
  write rolls the UI and the cache back.

One deliberate omission: the desktop distinguishes "this backend predates the flag" from "the
backend says false" and keeps the local set in the former case. The mobile client does not. Its
target backend carries `pinned`, so that compatibility rung has no rung to stand on.

A test caught a real subtlety: the pin is applied optimistically and then `refreshSessions()` runs,
whose response reflects the **already-updated** server state. A mock that kept answering
`pinned: false` made the follow-up list silently undo the optimistic row — correct behaviour from
correct code, which is why the fixture now models a server whose value actually changes.

## The stuck hover, and a fix that was half-right

iPadOS leaves `:hover` on the last-touched element and never clears it — there is no pointer to
move away. The list reuses DOM nodes as rows reorder (unpinning moves one out of `Pinned` into the
dated groups), so the stuck hover stayed on the node and belonged to whichever conversation now
occupied that slot. The user saw a **second** row painted as selected, fixed in position, unrelated
to which row they had acted on.

Three wrong hypotheses were discarded along the way, each by a measurement rather than by argument:

| Hypothesis | What ruled it out |
| --- | --- |
| `isActive` matched the wrong row | The probe read `data-active="false"` on every row, `COUNT=0` |
| Focus was retained on a row | The user reported the highlight was at a **fixed position**; focus cannot do that |
| `data-session-row` would let the guard find the row | The probe found **no such attribute in the DOM**: `SidebarMenuItem` does not forward unknown `data-*` props, so that guard had never matched |

That third one was a real defect inside a fix of mine, and it is why dismissal now listens for
`click` rather than `pointerdown`: a long press suppresses its trailing click, so the press timer
owns its own gesture and no row marker is needed at all.

**The first hover fix was half-right and shipped as such.** It suppressed hover with `!important`
but did not exclude the active row. Because a stuck hover never clears, the row the user is reading
matches **both** `:hover` and `data-active`, so the suppression out-ranked the active styling: the
open conversation kept only `font-medium` and lost its background. Fixing it needed the two rules to
be **mutually exclusive** (`:not([data-active='true'])`) rather than one overriding the other.

The lesson is narrower than "test more": when two states share one visual token, suppressing one
state has to be scoped to exclude the other, and the check for that is to look at the *still-correct*
case, not only at the symptom being removed.

## Two verification failures worth recording

Both produced a confident "verified" that was not one. They are the reason the methods above changed.

1. **A synthetic event is not an input.** The long press was first "verified" by dispatching a
   `MouseEvent('contextmenu')` from the probe and observing the menu open. That proves the handler is
   wired, **not** that the event ever arrives — and on hardware the long press did nothing, because
   WKWebView does not raise it here. Interaction now has to be exercised through the real input path.

2. **Reading code is not reading the contract.** The WS `session.title`/`session.delete` paths were
   built from code fragments and an assumption ("the session binds its profile at creation, so later
   calls do not need it"). The real calls answered `4001` and `4023` immediately. Backend contracts
   are now confirmed with real calls before implementation — and where the desktop already has a
   working path, its route is the contract to copy.

The lesson that generalises: a probe that *reads state* is trustworthy; a probe that *drives
interaction* is not, and a contract inferred from source is not a contract.
