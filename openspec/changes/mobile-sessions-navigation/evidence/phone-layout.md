# The session list on a phone

Tested on an iPhone 13 Pro simulator (390x844, iOS 26.5) with a loopback build against the Mac's own
gateway. Two things were wrong, and the first reading of both was wrong as well.

## What the phone does with the rail

`<Sidebar>` is not merely hidden below 768px — it is **not rendered**. The primitive returns a `Sheet`
when `useIsMobile()` is true, so the session list becomes a drawer that opens from the header's trigger.
Measured in the running app:

```
win 390x844 md=false
sidebar: absent      ← no [data-slot=sidebar] node at all, because it is a closed Radix Sheet
rail:    absent
inset:   0,0 390x844 d=flex p=relative
slots:   sidebar-wrapper@flex | sidebar-inset@flex | sidebar-trigger@flex
```

So "the session list disappeared" was never a layout bug: the list is behind the trigger the whole time,
which is why the drawer opened with the full grouped list once the trigger was pressed.

## Defect 1 — every `env(safe-area-inset-*)` was zero

`index.html` shipped `width=device-width, initial-scale=1.0` with **no `viewport-fit=cover`**, so all five
safe-area paddings already written in the shell (`pt-[max(1.5rem,env(safe-area-inset-top))]` on both
headers, `pb-[max(...,env(safe-area-inset-bottom))]` on the footer and the composer) resolved to 0. On an
iPad that is invisible — 1.5rem happens to equal the iPad status bar — and on an iPhone it put the
session title under the clock.

With `viewport-fit=cover` the same probe reports `safe-area top=47px bottom=34px`, and the header box grew
from 69px to 92px. The paddings were right all along; the meta tag was the missing half.

## Defect 2 — the drawer stayed open over the session it opened

Picking a session inside the drawer loaded the conversation *behind* it: the drawer covered three
quarters of the screen until something outside was tapped. Nothing in the shell closed it, because on a
wide screen there is nothing to close.

`CloseDrawerAfterPick` delegates one click listener from `document` while `isMobile`, and closes the
sheet when the press landed inside a `[data-slot=sidebar-menu-item]`. Delegation rather than a handler per
row: it covers a session, "start new session" and "refresh" in one place, and the gesture that changes
the pane is exactly the gesture that should dismiss the list.

## "The whole page is shifted — I have to pan right and down"

Seen on the physical iPhone right after the first install: the login card was cut on its left edge
("onnection mode", "sername") and the form ran past the right edge, so the page had to be dragged to be
read at all. It reads exactly like a layout wider than the phone.

It was not. A probe that reports `documentElement.scrollWidth` against `innerWidth` printed

```
win 390x844 html=390 body=390 scroll=0,0
```

— the document is precisely the width of the viewport, with no overflowing element to list. Reinstalling
the same code produced a correct first render, and the symptom has not come back.

So treat "pan to read" as a **WebView viewport-state symptom** before touching CSS: measure
`html/body.scrollWidth` against `innerWidth` first. If they are equal, no stylesheet can be at fault and
the fix is a fresh page load, not a layout change. Two of the three builds spent on this were chasing a
layout bug that measurement had already ruled out.

## The keyboard moved the page instead of shrinking it

With a short transcript, raising the keyboard on the device left the composer visible but pushed the
session header and the two messages off the top of the screen — the page had been scrolled to reach the
focused input. `svh`/`dvh` cannot prevent this: iOS shrinks the **visual** viewport (844 → 464) while the
layout viewport keeps its full height, so a shell sized in `svh` stays 844 tall and the system scrolls
whatever it must to reveal the composer.

The shell height now comes from `visualViewport.height`, written to `--app-height` on `resize`, `scroll`
and `orientationchange` (`ipad-main.tsx`), and both `<main>` elements size from
`h-[var(--app-height,100dvh)]`. With the keyboard open, measured:

```
inner 844  vv 464  off 0  scroll 0
app-h 464  shell 464px
header 0-…  composer 341-464  active=TEXTAREA
```

Shell height equals the visual viewport, the document does not scroll at all, and the composer sits inside
the visible band beneath the keyboard — so the transcript gives up the space instead of the whole page
moving.

One more layer on top of that: iOS scrolls the page to reveal the focused field **before** the shell has
shrunk, and that scroll is not undone by the resize. The symptom is a composer stranded at the very top of
the screen with a band of empty space above the keyboard — the page showing the *bottom* of a shell that is
only 464 tall. `apply()` now resets the scroll after sizing, guarded so a surface that genuinely scrolls
(the connection form under a raised keyboard) keeps its position:

```ts
if (document.documentElement.scrollHeight <= window.innerHeight + 1) window.scrollTo(0, 0)
```

## Note on the model pill

An earlier run showed **Deepseek V4 Pro** on a session whose transcript said the live model was
`deepseek-flash`, which is the shape of the cold-start bug fixed earlier. It did not reproduce: on the
physical device the pill read **Deepseek Flash** for a flash session, so the pill does follow the
session's own model rather than the profile default. Left as a note rather than a closed item — the
earlier reading was never verified against that session's record.

## Method

Every step here began with a measurement drawn into the screen from inside the app — viewport size, the
matchMedia result, each slot's `display`, the resolved safe-area values — because a simulator can be
screenshotted but not inspected. Two of the three hypotheses formed before those numbers arrived (a
missing rail, a hidden pane) were wrong; the numbers took one build each and ended the guessing.
