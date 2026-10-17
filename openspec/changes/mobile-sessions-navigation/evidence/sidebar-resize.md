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
