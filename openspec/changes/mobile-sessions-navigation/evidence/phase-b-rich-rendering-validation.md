# Phase B validation: rich transcript rendering

Date: 2026-09-13
Host: macOS (Intel), Xcode 26.5, iPad (A16) simulator, iOS 26.5 (23F77)
Change: `mobile-sessions-navigation`

## What landed

`src/ipad-session-detail.tsx` renders each transcript message through the desktop renderer's
`MarkdownTextContent` instead of the plain-text `chatMessageText` string, binding `isRunning` to
the message's `pending` flag:

```tsx
<MarkdownTextContent isRunning={Boolean(message.pending)} text={chatMessageText(message)} />
```

Nothing else changed — the message model, streaming merge and sidebar layout are untouched.

## Test results

```text
npm run test:ui   → 11 files / 50 tests passed
npm run typecheck → exit 0
```

Existing assertions (`getByText('Earlier reply')`, streamed deltas, replay recovery) still pass
against the markdown renderer.

## B3 — bundle measurement

```text
                    after phase A2    after phase B
startup path        1.0 MB / 5         ~2.2 MB / 8
  ipad-main                             434 KB
  i18n                                  648 KB
  vendor-md (markdown parser)           344 KB
  katex                                 256 KB
  vendor-react                          188 KB
shiki (lazy)                          18 MB    — NOT in startup
mermaid (lazy)                         2.8 MB  — NOT in startup
```

## B2 — lazy boundary verified

Static evidence from the production bundle:

- `ipad-main` references shiki only through `__vite__mapDeps(...)` — Vite's dependency map for
  *dynamic* imports, which records the chunk without downloading it.
- `shiki-block-CIF1duGW.js` is the only module that statically imports shiki
  (`import{n as e}from"./shiki-DcHhxNNC.js"`), and `shiki-block` is reached exclusively through
  `React.lazy(() => import('./shiki-block'))` in `shiki-highlighter.tsx`.
- The entry chunk contains **0** references to shiki.

## B5 — simulator verification

A probe drove a real connection and opened a stored session, then inspected the DOM:

```text
articles=5 | pre=16 | table=2
shiki-class-elements=16 | spans-in-first-pre=21
total-token-spans=73 | distinct-colours=5
colours=rgb(31,35,40) rgb(17,99,41) rgb(5,80,174) rgb(207,34,46) rgb(10,48,105)
shiki-blocks=5
```

Five distinct colours is the GitHub light palette (text / string / keyword / tag / variable) —
syntax highlighting is genuinely applied rather than falling back to unhighlighted text.
Screenshot: `phase-b-markdown-rendering.png`.

## B4 — highlighter trimming: not done, deliberately

The 18 MB shiki bundle is lazy and does not touch startup; the first code block in a session
triggers the load, and both probe runs produced highlighted output within a 10 s wait. Trimming
languages/themes would cut the download but adds configuration surface and risks dropping a
language a user needs. **Decision:** keep the desktop configuration, record the cost, and revisit
only if real-device measurement shows an unacceptable first-code-block delay.

## Two misdiagnoses worth recording

1. **`performance.getEntriesByType('resource')` returns empty in Capacitor's WKWebView.** The
   first probe concluded "shiki never loaded" from `chunks-before/after=none`. That API is
   unusable for this check on iOS — DOM inspection is the reliable signal.
2. **A zoomed screenshot of the first code block showed uniform colour**, which looked like
   "highlighting failed". That block carried no language annotation, so uniform colouring is
   correct behaviour. The colour-census probe settled it: 5 distinct token colours.

Both are methodology errors, not product defects; recorded so the next verification does not
repeat them.

## Not verified

- Android regression for the shared entry.
- Cold-start timing on a physical device (simulator only).
- Very long transcripts — only 5 messages were exercised; the renderer caches parsed blocks but
  that path was not stressed.
