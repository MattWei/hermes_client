# Auto-login, honest validation, and the disconnected-surface cleanup

Pieces of work that all sit on the connection surface: a credential that persists, a validation that
actually validates, and a page that stops saying things that are not true.

## 1. Auto-login

An opt-in checkbox on the secure sign-in form. Ticked, the credential is stored in the platform
keystore (`hermes.mobile.auto-login`, via the existing `SecureStore` plugin) and the next launch
signs in unattended; unticked, any stored credential is removed on the next successful sign-in.

**The launch pass supplies the address too — and that is not incidental.** The first implementation
called `setBackendAddress(stored.baseUrl)` and then immediately `connectRemoteGateway()`, which read
`backendAddress` from state. State updates are asynchronous, so the call still saw the previous
(empty) value and `parseMobileConnection('')` threw: auto-login could never work. The unit test
caught it before the device did. `connectRemoteGateway` now takes the address with the credentials:

```ts
async function connectRemoteGateway(pending?: { baseUrl: string; password: string; username: string })
```

**A successful unattended launch must not rewrite the preference.** The store/clear branch is
skipped when the call carries credentials, so an unchecked box cannot be silently re-armed by the
very behaviour it was meant to disable. Covered by a test.

Placement of the credential: component state holds the password for the duration of the form; only
the opt-in writes anything durable, and `clear()` (the full wipe) includes it. Disconnecting does
not — that would make "disconnect" quietly mean "forget my auto-login".

**Verified on hardware by the user**: tick, connect, force-quit, relaunch → connected without
prompting.

## 2. `Validate connection` no longer lies

It parsed the address and reported success. That is a format check wearing the language of a
reachability check — a false positive that sent a person hunting for the fault in the wrong place
(the observed incident: "validated" against a LAN address with nothing listening).

It now probes. `/api/status` is public, so it proves reachability and identity, and the LAN branch
adds an authenticated `/api/sessions?limit=1` because a public endpoint cannot speak for the token:

| Condition | Reported |
| --- | --- |
| Host unreachable / wrong port | the network error, or `Gateway replied HTTP <n>` |
| Reachable, not Hermes | `Reached that address, but it is not a Hermes gateway` |
| LAN token rejected | `The gateway is reachable, but it rejected the LAN token` |
| Healthy | `LAN gateway reachable (Hermes <version>) and the token was accepted.` |

The secure branch deliberately claims only reachability — `/api/status` needs no credential, so the
copy says "Sign in to connect" rather than implying the password was checked.

Guarded by a test whose point is the regression itself:

```ts
expect(screen.queryByText(/validated/i)).toBeNull()
```

## 3. The disconnected surface

**The composer came off the page.** `IpadComposer` was reused on the disconnected surface, where
`sessionId` is null and every control (`textarea`, `Attach`, `Send`) renders disabled. Its only
effect was a grey unusable box labelled *"Create a session to start a conversation"* — pointing at
an action whose entry point (`Start new session`) lives in the sidebar that appears only *after*
connecting. Removed, along with the now-orphaned import.

**The promo copy came off too**, at the user's request: the brand block (`Hermes` / `Your remote
workspace`), the `MOBILE CLIENT · PREVIEW` eyebrow, the `Ready when your workspace is.` headline,
the explanatory paragraph, and the `· Backend not connected` status chip. What is left is the
connection form and its own status line.

**One thing was kept against the instruction's letter**: the amber `EMULATOR-ONLY LOOPBACK TUNNEL`
notice. It is a safety warning, not description — it marks a build that must never reach a real
device — so it was moved above the form rather than deleted.

**Presentation:** a centred `Hermes` wordmark above the form; the password reveal moved *inside* the
field as an `eye` / `eye-closed` Codicon (its accessible name stays `Show password` /
`Hide password`, so assistive behaviour is unchanged); `Validate` and `Sign in` share the primary
button style and drop the redundant words (`Validate connection` → `Validate`,
`Sign in and connect` → `Sign in`).

## Test movement

| Kind | Count |
| --- | --- |
| New cases (auto-login store / clear / launch, plus the three probe outcomes) | ~7 |
| Re-pointed for the new contract (offline page, disconnect copy, button labels) | 12 |
| Suite | **12 files / 75 tests** |

Three failures during this work were **test defects, not product defects** — worth recording because
each cost a debugging cycle:

- A controlled checkbox flipped by `fireEvent.click` updates the DOM flag without reliably reaching
  React's `onChange`, so an assertion on the stale element passes while the state never moved. Fixed
  by re-querying after a render tick.
- The spy being asserted and the mock handed to the component were two different `vi.fn()`s.
- Two disconnect paths carry **different** copy (`Gateway disconnected.` vs
  `Gateway connection lost.`); a bulk replace had collapsed them into one.

## Not claimed

- Session listing, transcript rendering, and sending through the remote connection were not
  separately confirmed on hardware.
- Cookie TTL and the re-login path after expiry are untested; the sign-in form remains reachable
  after a disconnect, so re-authentication is possible but its trigger is unproven.
- The offline page's visual result (centring, icon placement, button parity) was not verified by
  screenshot — `devicectl` offers no capture and the device surface is only observable by hand.

## 4. The launch pass was one unhandled rejection

Noticed as a vitest footer — `6 errors`, exit 1 — on `src/ipad-home.test.tsx`, reported for the
whole file rather than any one test. Six tests render `<IpadHome />` without a `credentialStore`, so
they reach the real `mobileCredentialStore` → the `SecureStore` Capacitor plugin, which under jsdom
rejects with `"SecureStore" plugin is not implemented on web`. That rejection came out of the
mount-time auto-login effect, whose async IIFE had no `catch`. Every assertion in the file was
correct; the promise simply escaped, and the exit code stopped meaning anything.

This is not jsdom-only hygiene. **The read rejects on a real device too**: the iOS Keychain item is
`AfterFirstUnlockThisDeviceOnly`, so a launch before the first unlock rejects, and
`SecureStorePlugin.swift` rejects on any other Keychain error. The effect now absorbs it.

**Reporting it was the wrong first answer.** The first version wrote the failure to
`connectionMessage`, which broke `reports an unreachable endpoint instead of claiming validation`: a
mount-time message can land *after* the message for an action the person just took, and overwrite
it. That ordering hazard is real, not a test artifact — so the `catch` is deliberately silent. With
nothing read there is no auto-login, and the connection form underneath is already the fallback;
this codebase logs nothing from these modules, so silence is consistent too.

| `npm run test:ui -- --run src/ipad-home.test.tsx` | Result |
| --- | --- |
| Before | `6 errors`, exit 1 |
| After | `46 passed`, **0 errors**, exit 0 |

A test pins the decision from the other side: a store that throws leaves the connection surface
intact and carries no error text. The rejection itself is guarded by the error count being zero —
there is no assertion that can see an unhandled rejection directly.

**Project-wide, uncontended:** `npm run test:ui -- --run` → `633 passed (633)` files,
`6251 passed (6251)` tests, exit 0, and no `Errors` footer anywhere in the log. The command's exit
code means something again.

**A wrong conclusion worth recording.** The first full-project run reported 5 failures in 2 files
(`app/messaging/index.test.tsx`, `lib/markdown-blocks.test.ts`) and they were written off as
"pre-existing, unrelated" on the strength of a scope check — the failing tests import nothing from
the modules touched here. That was wrong. The run had two other vitest instances beside it, and both
files pass alone (`2 passed | 14 passed`). They were false failures caused by CPU contention, most
likely by this session's own concurrent runs. **A file's name is not evidence about why it failed**;
re-run it in isolation before attributing a failure to anything, including "pre-existing".
