# Switching profile on a phone

Reported: on the iPhone the profile could not be changed at all. The picker lives in the rail's footer —
and on a phone that rail is a Radix `Sheet`, i.e. a **modal dialog**.

## Why the picker was dead there

Every list in this app renders through a portal into `document.body` (see
`evidence/webkit-paint-failures.md` — an in-place list is not painted when it escapes a scroll container).
Inside a modal dialog that is fatal: everything outside the dialog's content is inert, and a pointerdown
outside it is routed to *dismiss the dialog*. A tap on the portalled list dismissed the drawer and never
reached the menu. The control looked present and did nothing.

This is the other half of the portal rule: **a portal escapes painting problems and dialog scoping alike**.
Inside a dialog the list must be portalled into the dialog's own content, not into the body.

## What changed

- `MobileSelect` finds the enclosing `[role="dialog"]` when it opens and portals into **that** element,
  positioning the list `absolute` against the dialog's box (`fixed` against the viewport when there is no
  dialog). Radix sees the tap as inside content, so it neither dismisses nor swallows it.
- The list opens **toward the room it has** — up from the rail footer and the composer pills, down from
  anything near the top.
- `ProfileSelect` is one component, and `RailProfileSwitcher` closes the drawer after a pick: switching
  profile replaces the whole workspace, so the list should not sit over the new one.

An earlier attempt put a second picker in the title bar instead. It worked, but it read as chrome bolted
onto the wrong surface — the profile belongs with the sessions it scopes. Fixed in place rather than moved.

## Verification

21 files / 183 tests, `tsc` clean, built and installed on the iPhone 13 Pro. Behaviour needs a thumb: open
the drawer, tap the profile name at its bottom, pick the other workspace.
