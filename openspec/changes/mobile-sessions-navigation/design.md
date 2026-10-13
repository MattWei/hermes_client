# Design: mobile sessions navigation

## Background

The mobile client is a single page (`ipad-home.tsx`, 391 lines) that already carries every
session-scoped capability — connection, session create/resume, streaming, replay recovery,
approval, tool activity, attachments. What it lacks is **navigation**: there is no list view and
no detail boundary, so the page grows downward instead of moving between views.

The desktop equivalent is not one page but four layers, and only some of them can be reused.

## Reuse boundary (measured)

| Layer | Verdict | Evidence |
| --- | --- | --- |
| Data / protocol adapters | **Reuse as-is** | 10 `mobile-*.ts` modules, platform-neutral, cover list / resume / create / prompt / stream / approval / tool activity / attachment |
| Message model | **Already reused** | `lib/chat-messages` (`ChatMessage`, streaming merge helpers) |
| Markdown renderer | **Reusable, lazy-loaded** | Spike: see below |
| Session list UI | **Build new (mobile form)** | Desktop sidebar is 20+ files built on profile/fleet/cron concepts the mobile client has no backend for |
| Shell / routing | **Build new (minimal)** | 82/644 files under `app/` touch `window.hermesDesktop`; routing depends on the pane tree and plugin registry |

## Decision 1 — Keep the desktop shell out of the mobile entry

`app/routes.ts` models a route as a session id inside a pane tree, with contributed routes from
the plugin registry. The mobile entry mounts no shell, so importing this would pull the desktop
window/pane model into a product that has neither.

**Decision:** introduce a minimal mobile view state (`'list' | 'session'`) in the mobile entry.
No router library, no pane tree, no registry.

## Decision 2 — Reuse the markdown renderer through its standalone entry

The desktop renderer exposes `MarkdownTextContent({ isRunning, text })`
(`components/assistant-ui/markdown-text.tsx`), which wraps `MarkdownTextSurface` in a
`TextMessagePartProvider`. It needs the `@assistant-ui/react` provider only — **not** the full
thread/attachment runtime.

**Decision:** phase B renders transcripts through `MarkdownTextContent` instead of reimplementing
markdown. Phase A keeps the existing plain-text path so the navigation work can land and be
verified independently.

## Decision 3 — Treat the desktop tree as runtime-safe, but verify per call site

The renderer's local import closure is **189 files, of which 30 reference `window.hermesDesktop`**
— far more than a directory-scoped grep suggests (that finds 9). The references are
overwhelmingly safe by construction:

- `api/*.ts` call `window.hermesDesktop.api(...)` **inside function bodies** — never at module
  evaluation time, so an unreached function cannot throw.
- `store/*`, `i18n/context.tsx`, `themes/context.tsx`, `lib/external-link.tsx` use optional
  chaining (`window.hermesDesktop?.foo`) or explicit guards (`if (window.hermesDesktop && ...)`).

**Decision:** static import is acceptable; no shim layer is required for rendering. Any *new* call
site added on the mobile path must still be checked, because reaching one of those function
bodies on a device without the bridge throws.

## Decision 4 — Keep heavy renderers lazy; do not let them into the cold-start path

The spike measured the full closure at **23 MB of JS across 29 chunks** (mobile entry was 272 KB
before). The dominant terms:

```text
shiki    18,982 kB   (lazy — unique static importer is components/chat/shiki-block.tsx)
mermaid   2,975 kB   (lazy)
i18n        662 kB
ipad-main   384 kB   (was 76 kB)
katex       259 kB
```

`shiki-block.tsx` carries an explicit warning: it is the only static importer of `react-shiki`,
and every consumer must reach it through `React.lazy` so the chunk stays off the boot path. The
spike respected that: the app launched and rendered with no runtime error, and the shiki chunk is
loaded on the first highlighted code block rather than at boot.

**Decision:** phase B keeps the lazy boundary exactly as the desktop does. If the installed size
matters, trim at the highlighter configuration (languages/themes) rather than by statically
importing anything.

## Decision 5 — Desktop-shaped shell, but no pane tree

The connected mobile client reuses the desktop **layout primitives**
(`components/ui/sidebar`) so it takes the same shape as Hermes Desktop: a collapsible left session
sidebar, with the open session in the inset. Reuse analysis and measurements:
`evidence/desktop-shell-layout.md`.

Deliberately **not** reused: the desktop sidebar's content layer (profile rail, fleet rail, cron
section, projects, drag reordering — 1,900+ lines coupled to the plugin registry, dnd-kit and
desktop stores), and the pane tree / multi-session tiling, which is a large-screen affordance with
no mobile backend.

## Verification matrix

| Check | Method | Status |
| --- | --- | --- |
| Renderer runs on mobile without the bridge | Spike screen with `window.onerror` capture | Passed — `NO RUNTIME ERROR CAPTURED` |
| Code block, KaTeX (inline + block), table, list, link, quote | Spike screen, simulator screenshot | Passed |
| Cold start unaffected by shiki | Chunk graph (lazy boundary intact) | Passed by construction; to be re-measured in phase B |
| List ⇄ detail navigation | `ipad-home.test.tsx` style suite | Phase A |
| Auto-load of the session list on connect | Unit test on the connect path | Phase A |
| Plain-text phase unaffected | Existing mobile suite (11 files / 49 tests) | Phase A regression |

## Out of scope

Panes, profiles, fleet, cron sidebar, plugin routes, protocol changes.
