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

## The second failure: the bytes arrived and the bridge changed their shape

After the first fix the player still said 错误. The decisive evidence was **not** in the app — it was the
gateway's own access log:

```
GET /api/files/stream?path=...commute_isom60-80608.mp3      200  200880
GET /api/files/stream?path=...drill_chunk2-20940-slow.mp3   200  150908
```

The request succeeded with the exact byte counts on disk: authentication, the path, and the route were all
fine. The failure was after the response arrived — `CapacitorHttp` serialises the body across the native
bridge, and an `arraybuffer` request comes back as a **base64 string**, not an `ArrayBuffer`. Treating it as
an `ArrayBuffer` produced a zero-byte blob, which an `<audio>` reports exactly like a missing file.

`toBytes()` now decodes every shape a bridge may produce (ArrayBuffer, typed-array view, byte array, base64
string) and, when none applies or the result is empty, throws with the shape it saw. That message is shown
under the player, so the next failure of this kind names itself instead of reading like a dead file.

**Lesson recorded:** when a remote surface fails at a request, read the *server's* access log before
theorising about the client. A `200` with a real byte count eliminates the whole authentication/path/route
family in one line and points at the seam where the client already has the data.

## Tradeoff, stated rather than hidden

The whole file is fetched before playback instead of streaming: `CapacitorHttp` returns a buffered body.
Conversation audio is small (a clip, a voice note — the files in the report are 25 s mp3s), and a complete
blob is exactly what gives `<audio>` a seekable source. A long-recording path would need Range requests
through the same route, which the gateway already supports.

## Verification

`mobile-media.test.ts` (10 cases): the URL it builds, `file://` stripping, the LAN header, no header on a
secure connection, the object URL's type, a 404 rejected rather than played, the non-native fallback, base64
decoding, an unusable body named rather than mounted, and every accept-to-bytes shape.
Mobile suites: 29 files / 264 tests, `tsc` clean.

On the device: the drill clips play on iPhone 13 Pro / iOS 18.3.2.
