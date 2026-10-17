# Two WebKit paint failures, and what actually caused them

Both bugs looked like "this control is missing". Neither was about the control: in both cases the element
was in the DOM, hit-tested correctly, and measured correctly — and no pixels were drawn.

The measurement that settled it came from the app itself, because there is no other way to read a
WKWebView's computed styles from a desktop:

```
DBG o=1 d=block v=visible 135x42@391,1085
```

Opacity 1, display block, visibility visible, real size, real position — and nothing on screen.

## 1. The composer's model controls: `overflow-x-hidden` on the ancestor

The controls sat inside `SidebarInset`. While fixing "a wider sidebar pushes the conversation off the
edge" I had added `overflow-x-hidden` there. That turns the pane into a scroll container, and WebKit then
stopped painting static descendants of the composer inside it. The sidebar footer — outside the inset —
kept working, which is what pointed at the difference.

**`min-w-0` was the real fix for the width problem; the `overflow-x-hidden` beside it was the bug.** It
is removed, and the comment in the code says why.

## 2. The menus: a portal, not an absolutely positioned child

The dropdown (shared by the model, thinking level and profile pickers) was `absolute bottom-full` inside
its control. Measured: `240x80@14,1027`, opacity 1, visible — and invisible, every time. It opens
upward, i.e. it escapes over the session list, which is `overflow-y-auto`; WebKit composites a scrolling
container as its own layer and paints it above positioned siblings.

Raising `z-index` did nothing. **Rendering the list into `document.body` as a fixed-position layer did** —
a portal has no scrolling ancestor at all. That is also what the desktop's own menus do, which is the
general lesson: a menu that must escape its trigger belongs outside the trigger's tree.

## 3. The menu that closed itself

A "close on scroll" listener closed the menu on the same frame it opened: opening scrolls the list to the
current row, and that programmatic scroll reached the window-level listener. Removed — outside tap and
Escape are the ways out.

## Method note

Three shipped guesses (text selection, iOS tap highlight, the native `<select>`) each cost a build and
changed nothing. The screenshot the user sent after the second one moved the diagnosis further than any
of them, and the computed-style readout finished it. When a symptom is "invisible on device only", ask
for a picture first and instrument the box before touching the code.
