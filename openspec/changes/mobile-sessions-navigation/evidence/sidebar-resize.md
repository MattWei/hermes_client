# Dragging the session list wider, capped at 90% of the screen

The list sits in a fixed-width rail (the primitives' `--sidebar-width`, 16rem). On a tablet that is a
guess about how much of a long title a person wants to read, so the right edge is now a grip.

## How the width travels

The `SidebarProvider` writes `--sidebar-width` into a style object and the primitive's own container, its
gap spacer and the inset all read that one variable. Passing the dragged width **there** — rather than
setting a width on our own wrapper — is what keeps those three in agreement; a local `style.width` would
move the panel and leave the gap behind.

While a drag is in progress the wrapper carries `[&_*]:transition-none!`, because the primitive animates
`transition-[left,right,width] duration-200` and an animated edge lags the finger by design.

## The inset has to be told it may shrink

First report after the drag shipped: widening the sidebar cut the conversation off on the right instead
of narrowing it, composer included.

`SidebarInset` is `w-full flex-1 flex-col` — and a flex item's default `min-width: auto` refuses to shrink
below its own content. So the layout was: gap spacer grows by the dragged width, and the pane beside it
keeps its intrinsic width and gets pushed off the edge. `min-w-0` on the inset is the whole fix; the
`overflow-x-hidden` beside it stops any transient overflow during a drag from producing a scrollbar.

This is the classic flexbox trap, and the desktop never hit it because its sidebar does not resize.

## Why the cap is a ratio

`clampSidebarWidth(desired, viewport)` caps at **90% of the viewport**, not 90% of some remembered pixel
width: the same table can be rotated, and the app can run in a narrower window. The strip that stays
visible is the point — it says "this is a layer over the conversation", and a sidebar that fills the
screen hides the session it is meant to be a layer over.

**The ratio outranks the minimum width.** On a viewport narrower than a usable sidebar (180px) the cap
wins, because "never fills the screen" is the promise that has to hold unconditionally; the minimum is
only a comfort floor.

## A drag that selects text instead of resizing

Reported: repeatedly changing the width left "a highlighted block" at the bottom of the rail, with the
profile picker and the status line no longer visible.

That is what a **native text selection** looks like: WebKit starts one on `pointerdown` unless the default
is prevented, paints the selection above the content, and the footer area under the finger is exactly
where the drag begins. `touch-none` stops the page scrolling; it does not stop selection.

Three defences, all in `beginResize`/`endResize`:

- `event.preventDefault()` on `pointerdown`, and `select-none` + `[-webkit-touch-callout:none]` on the
  grip — on iOS the callout is a second way to turn a drag into a selection.
- `select-none` across the shell **while resizing only**, so nothing can be selected mid-gesture.
- `getSelection()?.removeAllRanges()` on both ends, which clears one that started anyway.

Also fixed alongside it: the width now updates **once per animation frame** (pointer events arrive far
faster than the screen paints, and a state update per event re-rendered the whole rail dozens of times a
second mid-drag), and `SidebarFooter` is `shrink-0` so a long session list can never squeeze it out.

## The stale paint, from a screenshot

The bug report finally came with a picture: repeated width changes, then background, then foreground, and
a pale blue block runs from under the selected row to the bottom edge of the screen — the profile picker
and the status line are not drawn at all.

The colour is the selected row's accent background. So the footer is not missing; it is **painted over**
by a stale raster of that row, composed at the old width and never discarded. The rail is a `fixed`
element whose width changed under it, and WebKit kept the old backing store until something forced a
re-composite — which backgrounding does.

Two rules came out of it:

- **Re-raster after the width settles.** `endResize` toggles the container's `display` off and on, reading
  `offsetHeight` in between so the reflow happens before the restore (one repaint, not a blank frame).
- **Re-raster on the way back from the background**, on `visibilitychange === 'visible'`, because that is
  the exact moment the stale layer reappears.

Ruled out first, each by shipping it and hearing the symptom survive: a native text selection
(`select-none`, `removeAllRanges`), iOS's tap highlight (`-webkit-tap-highlight-color: transparent`), and
the native `<select>` itself (replaced with the drawn menu). Three guesses that cost a build each are why
the screenshot was worth asking for.

## The structural change that silently did nothing

First attempt at taking the rail out of `position: fixed` shipped, was tested, and the block came back —
because **none of the classes made it into the stylesheet**.

```tsx
// WRONG: the class glued to `${` is never extracted
className={`... [&_[data-slot=sidebar-gap]]:hidden${resizing ? ' ...' : ''}`}
```

Tailwind's scanner appends the interpolation to the last class instead of treating it as a boundary, so
`hidden` is dropped as part of a nonsense candidate. With the gap rule missing and the `relative!`
override missing, the shipped build kept the original `fixed` layout — the rail never moved, and the
"fix" could not have worked.

Put the interpolation first and keep static classes at the end:

```tsx
className={`${resizing ? '[&_*]:select-none [&_*]:transition-none! ' : ''}h-svh ... [&_[data-slot=sidebar-gap]]:hidden`}
```

Verify in the **built CSS**, not the source: the three rules must exist —
`relative\!{position:relative!important}`, `[data-slot=sidebar-gap]{display:none}`, and the
`group-data-[state=collapsed]` hide. Class-name greps on the JS bundle prove nothing.

## Interaction notes

- Pointer events, not mouse+touch pairs, so a finger and a trackpad run the same code.
- `touch-none` on the grip so the drag is not stolen by the list's scroll.
- `setPointerCapture` keeps a fast drag alive when the finger outruns the 12px strip.
- The width is **not persisted** across launches: nothing was asked for, and a stored pixel width is
  exactly the thing that goes wrong after a rotation (see above). If it should stick, it belongs in a
  profile-scoped key.

## Verified on hardware

After the `min-w-0` fix the user confirmed the drag: the rail widens, and the conversation beside it
narrows to fit (composer intact). The clamp has 4 tests; the drag gesture itself has no automated
coverage because jsdom has no layout, so the hardware confirmation is the evidence for it.
