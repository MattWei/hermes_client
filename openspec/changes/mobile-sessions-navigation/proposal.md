# Proposal: Mobile sessions navigation (list + session detail)

## Why

The mobile client renders one long single page. After a gateway connects there is no session list
to land on and no way to enter or leave a conversation, so a successful connection looks like
nothing happened.

Measured on the macOS iPad (A16) simulator (iOS 26.5): `connectLanGateway()` sets the gateway,
flips the status chip to `LAN gateway connected.`, and stops. The saved-session list is only
populated when the user separately presses **Refresh sessions** — nothing loads it automatically.

The desktop client reaches sessions through its app shell (sidebar + pane tree + `/<sessionId>`
routes). That shell does not exist in the mobile entry: `ipad-main.tsx` mounts a single
`<IpadHome />`. It also cannot be lifted as-is — of the 644 `.ts/.tsx` files under `app/`, **82
touch `window.hermesDesktop`**, and the shell is built on the pane tree and the plugin registry.

## What Changes

- Add a mobile view model: **session list ⇄ session detail**, with back navigation.
- Add a **session list view** (title, preview, refresh, new session).
- Add a **session detail view** (transcript, composer, approval card, tool activity) extracted
  from the current single page.
- **Load the session list automatically** once a gateway connects.
- Stage rich rendering: phase A keeps the current plain-text transcript, phase B lazy-loads the
  desktop markdown renderer.

## Scope

- The iPadOS/Android shared React mobile entry only (`ipad-main.tsx` plus new mobile-only
  components).
- Reuse of the existing platform-neutral adapters (`mobile-*.ts`) and `lib/chat-messages`.

## Non-goals

- Reproducing the desktop pane tree, multi-session tiling, or the window/pane mirror.
- Reproducing sidebar concepts the mobile client has no backend for (profile rail, fleet rail,
  cron section, remote-connection switcher).
- Importing `app/routes.ts`, the pane shell, or the plugin registry into the mobile entry.
- Changing the backend protocol or the authentication model.

## Current status

Assessment and technical spike complete (see `design.md` and
`evidence/mobile-markdown-renderer-spike.md`). No implementation started.
