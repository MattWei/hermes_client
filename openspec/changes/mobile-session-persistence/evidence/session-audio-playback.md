# Playing a conversation's audio on a phone

Reported: an mp3 in a session renders a player that says **错误** (error), with an "Open audio file" link
under it that does nothing.

## Why the player is empty

The markdown carries a gateway path (`/srv/.../drill.mp3`) inside a `#media:` href, and the shared renderer
resolves it through `lib/media.ts`. Every branch there was written for a surface that has one of two things:

```ts
if (window.hermesDesktop && isRemoteGateway()) return gatewayMediaDataUrl(path)   // Electron + remote
if (!window.hermesDesktop?.readFileDataUrl) return mediaExternalUrl(path)          // ← the phone lands here
```

`mediaExternalUrl` returns `file:///srv/...` when `isRemoteGateway()` is false — and on the phone it always
is, because `$connection` is a **desktop** store that the mobile surface never writes. A `file://` URL on
iOS is not something the app can load, so `<audio>` fires `onError` and paints its failure state.

The "Open audio file" fallback then called `openExternalLink`, which is `window.hermesDesktop?.openExternal`
— undefined on a phone. A control that cannot act, next to a player that cannot play.

## What changed

- **A loader seam in `lib/media.ts`.** `setMobileMediaLoader(fn)` — a surface that is not Electron
  registers how *it* reaches a gateway file, and both `resolveMediaDisplaySrc` and
  `resolveMediaPlaybackSrc` consult it before the Electron branches. One registry, so images and video get
  the same treatment as audio without a second path.
- **`mobile-media.ts` fetches the bytes over the authenticated connection.** `GET /api/files/stream?path=…`
  (the route that already serves inline with Range support) through `CapacitorHttp` with
  `responseType: 'arraybuffer'`, wrapped in a `Blob` and returned as an object URL. LAN connections send
  `X-Hermes-Session-Token`; secure ones ride the dashboard cookie, the same split every other mobile call
  uses.
- **Registered on connect, cleared on disconnect** in `ipad-home.tsx`.
- **No dead fallback.** On a surface with a mobile loader the failed-media state renders the reason
  ("Couldn't fetch … from the gateway") instead of an "Open audio file" button that has nothing to open.

## Tradeoff, stated rather than hidden

The whole file is fetched before playback instead of streaming: `CapacitorHttp` returns a buffered body.
Conversation audio is small (a clip, a voice note — the files in the report are 25 s mp3s), and a complete
blob is exactly what gives `<audio>` a seekable source. A long-recording path would need Range requests
through the same route, which the gateway already supports.

## Verification

`mobile-media.test.ts` (7 cases): the URL it builds, `file://` stripping, the LAN header, no header on a
secure connection, the object URL's type, a 404 rejected rather than played, and the non-native fallback.
Mobile suites: 29 files / 264 tests, `tsc` clean.
