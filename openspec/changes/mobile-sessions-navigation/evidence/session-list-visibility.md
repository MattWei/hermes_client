# An empty rail is not the same as an empty workspace

The session list read was wrapped in `.catch(() => {})`. A failure left the rail empty, and an empty rail
reads exactly like a profile with nothing in it — the one case where saying nothing is worse than saying
what broke. A stale stored session on the iPad simulator produced precisely that ambiguity: connected,
`Backend ready`, and no rows, with nothing to distinguish it from "no sessions".

## What changed

`loadConnectedSurface` grew one `loadSessions(profileName)` that all three call sites share. On success it
clears the message; on failure it records one. Two things happen on the way to that message:

```ts
.catch(async (error: unknown) => {
  if (error instanceof MobileSessionAuthError && await reauthenticate()) return
  setSessionListError(error instanceof Error ? error.message : 'Unable to load sessions')
})
```

- **Re-authenticate before reporting.** The refresh action already did this; the initial load did not, so a
  session that expired between launches surfaced as an empty workspace instead of a silent retry.
- **Report in the rail, above the list**, where the missing rows would be (`role="alert"`), not in the
  connection status — the connection is fine, and saying otherwise would send someone to the wrong place.

Switching profile clears it, since the new workspace has its own read.

## Verification

`ipad-home.test.tsx` gains a case where `/api/status` answers and `/api/sessions` throws; the alert names
the failure. 21 files / 184 tests, `tsc` clean, built and installed on both devices.
