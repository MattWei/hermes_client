# Sidebar footer: gateway and status, not a log

The footer used to end with whatever `connectionMessage` last said — "Session X resumed." after every
open, an error when something failed. That is a log, in the one place a person expects a status line.

## What the footer shows now

| Row | Source |
| --- | --- |
| Profile picker (taller: `min-h-10`, `text-sm`) | `profiles` from `GET /api/profiles` |
| `globe` + host + health | host from the connection address; health from `GET /api/status` |

The health phrase comes from the backend's own platform rollup — the same `gateway_platforms` the
desktop status bar reads for "Backend weixin down". Confirmed against the live backend:

```json
{"gateway_running": true, "gateway_state": "running",
 "gateway_platforms": {"api_server": {"state": "connected", "needs_attention": false, ...}}}
```

`readGatewayStatus` reports the backend and nothing else: **`Backend ready`** when the gateway is
running, `Backend stopped` / `Backend <state>` when it is not, and an empty label when the payload does
not say — because a payload that never mentions the gateway is not evidence of a healthy one.

### Why platforms are out of scope here (settled with the user)

Two earlier cuts got this wrong in opposite directions, and the user's final word is the rule:

1. Any unhealthy platform became the headline, so a running gateway read `weixin fatal`.
2. Corrected to `Backend ready` with a muted `weixin fatal` beside it.

Neither belongs on this screen. **The mobile footer reports the backend it is connected to** — that is the
only thing the person can act on from here, and the connection itself is already proven by the surface
being on screen. A messaging adapter that failed to start (`adapter_unavailable`, on this backend since
Oct 11) is a real problem for a different audience; repeating it here is noise dressed as status.

So `gateway_platforms` is not parsed at all, and the footer reads `🌐 api.wei-agent.com   ✓ Backend ready`.

## Where the messages went

`connectionMessage` did not disappear: it moved under the session title in the inset header. Errors are
feedback; they belong next to the thing they are about, and losing them entirely to tidy a footer would
trade one bug for a worse one.

## Not verified here

The layout itself, on hardware — `devicectl` cannot screenshot an iPad, so the evidence is the tests
(7 for the status/host parse), the bundle contents, and the user's own eyes.
