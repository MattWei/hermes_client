# Spike: desktop markdown renderer on the mobile client

Date: 2026-09-13
Host: macOS (Intel), Xcode 26.5, iPad (A16) simulator, iOS 26.5 runtime (23F77)
Change: `mobile-sessions-navigation`

## Question

Can `components/assistant-ui/markdown-text.tsx` render inside the mobile client — where
`window.hermesDesktop` does not exist — and what does it cost?

## Method

1. **Static.** Resolve the local import closure of `markdown-text.tsx` and locate every reference
   to `window.hermesDesktop`, distinguishing guarded from unguarded access.
2. **Dynamic.** A temporary spike entry (`mobile-markdown-spike.tsx`) rendered
   `MarkdownTextContent({ isRunning: false, text })` with a sample containing a heading,
   paragraph, TS code block, inline and block KaTeX, a table, a list, a link and a blockquote.
   `window.onerror` and `unhandledrejection` were captured and painted on screen so a failure
   would be visible in the screenshot rather than only in a console.
3. Build mobile → `cap sync ios` → `xcodebuild` → install and launch on the iPad (A16) simulator
   → screenshot.
4. Remove the spike and re-measure to prove a clean removal.

## Results

### Static

- Local import closure: **189 files**; 28 npm packages.
- Files referencing `window.hermesDesktop`: **30** — far above the 9 found by a directory-scoped
  grep of `components/chat` + `components/assistant-ui`, because the closure reaches `api/`,
  `store/`, `i18n/`, `themes/`, `hooks/` and `lib/`.
- Sampling showed the access patterns are safe by construction:
  - `api/*.ts` → `return window.hermesDesktop.api(...)` **inside function bodies**.
  - `store/*`, `i18n/context.tsx`, `themes/context.tsx`, `lib/external-link.tsx,
    components/ui/copy-button.tsx` → optional chaining or explicit `if (window.hermesDesktop)`.
- Consequence: module evaluation never reaches the bridge, so a static import is safe and no shim
  layer is needed for rendering. Reaching one of those function bodies on a device without the
  bridge would still throw, so new call sites must be checked individually.

### Dynamic

- Build: succeeded.
- Runtime: **no error captured** (`NO RUNTIME ERROR CAPTURED` on screen).
- Rendering verified in the simulator screenshot (`mobile-markdown-spike-render.png`): heading,
  paragraph, code block, inline `E = mc²`, block integral, table, list, link and blockquote all
  rendered.

### Cost

```text
JS totals       : 23 MB across 29 chunks      (baseline before the spike: 272 KB / 4 chunks)
shiki           : 18,982 kB   lazy — unique static importer is components/chat/shiki-block.tsx
mermaid         :  2,975 kB   lazy
i18n            :    662 kB
ipad-main       :    384 kB   (baseline 76 kB)
katex           :    259 kB
App.app on disk : 38 MB       (baseline ~15 MB)
```

`shiki-block.tsx` documents that it is the only static importer of `react-shiki` and that every
consumer must reach it through `React.lazy` to keep the chunk off the cold-start path. The spike
preserved that boundary and the app launched normally, so the shiki cost is an on-demand cost
(first highlighted code block), not a boot cost.

## Conclusion

Reuse is **technically viable** on mobile with no shim layer. The cost is installed size, not
runtime failure, and the largest term is already lazy. Phase A of the change therefore ships the
navigation with the existing plain-text transcript, and phase B adds the renderer behind the same
lazy boundary, with a bundle measurement as its acceptance check.

## Cleanup

The spike entry was removed and `ipad-main.tsx` restored (no diff against git). The rebuilt
bundle returned to **272 KB across 4 chunks**, confirming the spike left nothing behind.
