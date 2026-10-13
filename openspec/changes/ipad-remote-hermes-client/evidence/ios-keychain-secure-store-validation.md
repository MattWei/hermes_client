# iOS Keychain SecureStore plugin: implementation and runtime round-trip validation

Date: 2026-09-12

## Scope

Implements the iOS counterpart of `SecureStorePlugin.java` and proves the Keychain
round-trip at runtime with ephemeral test data. It closes the first item of
"Required iOS work" in `docs/mobile-macos-handoff.md`.

No credential, token, or real user value was written. The round-trip used an ephemeral
throwaway value; neither the value nor any Keychain payload is recorded in this evidence.

## Implementation

New app-local (non-package) Capacitor plugin, mirroring the Android contract exactly:

```text
apps/desktop/ios/App/App/SecureStorePlugin.swift
```

- `jsName = "SecureStore"`; methods `get` / `set` / `remove` (all promise-returning).
- Contract parity with `src/mobile-credential-store.ts` and the Android plugin:
  - `set({key, value})` resolves empty; both fields required else rejects.
  - `get({key})` resolves `{ value }`, or resolves empty when the item is absent.
  - `remove({key})` resolves empty and is idempotent for a missing item.
- Storage: Keychain generic-password items under service `hermes.mobile.secure-store`,
  account = caller key, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
  `set` deletes any existing item first, so a write is an upsert rather than an
  `errSecDuplicateItem` failure.

Local plugins need an app-side registration hook, which the off-macOS-generated board
never had:

```text
apps/desktop/ios/App/App/MainViewController.swift   # CAPBridgeViewController subclass
  override capacitorDidLoad() { bridge?.registerPluginInstance(SecureStorePlugin()) }
```

Wired in both entry paths so the subclass is used regardless of which one wins at runtime:

- `App/Base.lproj/Main.storyboard` — `customClass="MainViewController" customModule="App"`
- `App/SceneDelegate.swift` — `window?.rootViewController = MainViewController()`

Both Swift files were added to the `App` target's Sources build phase in
`App.xcodeproj/project.pbxproj`.

## Runtime validation

Environment: Xcode 26.5, iOS 26.5 Simulator (23F77), iPad (A16), `Debug` build.

Harness: a temporary script injected into the built `App.app/public/index.html` called
`Capacitor.Plugins.SecureStore` and printed the result on-screen. It was removed after
validation; the shipped artifact carries the unmodified bundle.

Observed result:

```text
[KEYCHAIN ROUND-TRIP]
platform=ios
plugin=present
set=ok
get=match
remove=ok
after-remove=empty
RESULT=ALL PASS
```

Interpretation: the plugin is registered and reachable from the WebView; a value written
by `set` reads back identically via `get`; `remove` clears it; a subsequent `get` returns
empty. This is a real Keychain round-trip, not a stub.

## Required build change: do not disable code signing

The first attempt failed with:

```text
Unable to securely save credential (keychain status -34018)
```

`-34018` is `errSecMissingEntitlement`. Building with `CODE_SIGNING_ALLOWED=NO` produces an
unsigned app with no `application-identifier` entitlement, and Keychain access is refused.
Building for the simulator with the default (ad-hoc) signing fixes it — no developer team or
provisioning profile is needed for a simulator build.

```text
Correct:  xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
            -destination 'platform=iOS Simulator,name=iPad (A16)' build
Wrong:    ... same command plus CODE_SIGNING_ALLOWED=NO
```

Artifact: `Signature=adhoc`, `App` binary sha256
`d7ce2b2f838b885a10f91b793421c5557a867896fb5a1f6ba93ba6e556ef1c84`.

## Offline surface after the plugin change

The app still launches into the default offline mobile home with the plugin registered:

- Screenshot: `ios-offline-home.png`
  (sha256 `19943a141b4a6f843ec0614d10b3d8b2dd60886b828992dc93937b9f037ae2e2`)

## Explicit non-claims

- No real credential, LAN token, or OAuth/refresh token was stored.
- No backend connection, native PKCE, REST, or WSS flow was exercised.
- No physical iPad, real signing identity, or provisioning profile was validated.
- The Keychain item was written with `ThisDeviceOnly` accessibility; cross-device
  migration and iCloud Keychain sync are intentionally out of scope.
