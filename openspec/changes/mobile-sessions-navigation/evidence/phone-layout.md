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

## Still open

The composer's model pill reads **Deepseek V4 Pro** on a session whose transcript states the live model is
`deepseek-flash`. That is the shape of the cold-start bug fixed earlier (the pill reading the profile
default instead of the session's own model), but it was not confirmed here: confirming it needs the
backend's session record, and the local gateway rejects unauthenticated reads. Verify before treating it
as a regression.

## Method

Every step here began with a measurement drawn into the screen from inside the app — viewport size, the
matchMedia result, each slot's `display`, the resolved safe-area values — because a simulator can be
screenshotted but not inspected. Two of the three hypotheses formed before those numbers arrived (a
missing rail, a hidden pane) were wrong; the numbers took one build each and ended the guessing.
