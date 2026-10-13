# Physical iPad deployment

## Simulator-only assumptions that do not survive contact with real hardware

Three things pass on the simulator and fail on a device. One is a product fix, two are
prerequisites of the environment.

### 1. Local network permission — FIXED

`Info.plist` declared no `NSLocalNetworkUsageDescription`. iOS 14+ requires it to reach any host on
the local network, so on hardware the connect attempt would have been denied by the system. The
simulator does not enforce this check, which is why it never surfaced during the simulator work.

Added:

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Connect to your Hermes agent backend running on your local network.</string>
```

`NSAppTransportSecurity / NSAllowsArbitraryLoads` was already present, so cleartext LAN traffic was
already permitted — only the permission string was missing.

### 2. A loopback-bound backend cannot serve a LAN client — environment constraint

The backend's Host-header guard (`hermes_cli/web_server.py`, `_is_accepted_host`) accepts, for a
loopback bind, only loopback Host values. A request carrying the LAN address as Host is rejected:

```text
{"detail":"Invalid Host header. Dashboard requests must use the bound hostname or the configured
public hostname."}
```

This is the DNS-rebinding defence (GHSA-ppp5-vxwm-4cf7) working as designed, not a bug.

Binding `0.0.0.0` is not a workaround: it is refused outright unless a password/OAuth provider is
registered, and the mobile client's LAN mode is deliberately built on session tokens rather than
Basic/OAuth. The refusal message states the supported shape explicitly — loopback bind, with the
external URL reached through a local reverse proxy.

Confirmed end-to-end with a throwaway proxy (REST 200 with token, 401 without, WebSocket 101), then
removed. The device will instead be pointed at a separately provided backend, so nothing from that
proxy carries into the shipped path.

### 3. Developer Mode and a signing team — environment prerequisites

- With Developer Mode off, `xcodebuild` cannot resolve the destination and fails with
  `Developer Mode disabled ... enable Developer Mode in Settings → Privacy & Security`. Enabling it
  requires a device reboot, and the device then reports `connected` instead of `available (paired)`.
- Without a development team in the target, the build fails with
  `Signing for "App" requires a development team`.

## Build path for hardware

The emulator build flag must NOT be used — it permits loopback, which hardware intentionally
rejects:

```bash
# simulator-only flag, deliberately omitted for device builds
VITE_MOBILE_EMULATOR_LOOPBACK=1
```

Device build (flag unset, so the client enforces its RFC1918-only rule):

```bash
cd apps/desktop
npm run build:mobile                    # no VITE_MOBILE_EMULATOR_LOOPBACK
npx cap sync ios
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=<device-udid>' -allowProvisioningUpdates build
```

Note the emulator and device builds are **different bundles**: running the device bundle on a
simulator will refuse `127.0.0.1`, and the simulator bundle must never be used on hardware.
