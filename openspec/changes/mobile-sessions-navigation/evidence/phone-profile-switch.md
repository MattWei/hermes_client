# Switching profile on a phone

Reported: on the iPhone the profile could not be changed at all. The picker was in the session rail's
footer — and on a phone that rail is a Radix `Sheet`, i.e. a **modal dialog**.

## Why the picker was dead there

Every control in this app that opens a list renders it through a portal into `document.body` (see
`evidence/webkit-paint-failures.md` — an in-place list is not painted when it escapes a scroll container).
Inside a modal dialog that is fatal: Radix marks everything outside the dialog's content as inactive and
routes pointer events outside it to *dismiss the dialog*. So a tap on the portalled list dismissed the
drawer and never reached the menu. The control looked present and did nothing.

This is the other side of the portal rule: **a portal escapes painting problems and dialog scoping alike**,
so a control that lives inside a dialog needs either a dialog-scoped container or to live outside the
dialog.

## What changed

- `ProfileSelect` extracted from the footer markup so the picker is one component, not two copies.
- `PhoneProfileSwitcher` renders it in the **title bar** when `isMobile` and there is more than one
  profile. The title bar is outside the drawer, so the same portal behaves exactly as it does on a tablet.
- `MobileSelect` opens **toward the room it has**: upward when the trigger is low on the screen (the
  composer pills, the rail footer), downward when it is high (the phone's title bar). Before this, the list
  was always `bottom`-anchored and a title-bar picker would have opened off the top of the screen.

The footer picker remains for the wide layout, where the rail is not a dialog.

## Verification

21 files / 183 tests, `tsc` clean, built and installed on the iPhone 13 Pro. The behaviour itself needs a
thumb: tap the profile name in the title bar, pick the other workspace.
