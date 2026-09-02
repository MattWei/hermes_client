# Tasks

## Completed in WSL/Android

- [x] Mobile entry split and Capacitor Android/iOS project generation.
- [x] LAN endpoint/auth gates and Android secure store.
- [x] Native REST adapter, session lifecycle, streaming, and replay recovery.
- [x] Session-scoped approval and tool activity UI.
- [x] Non-image attachment staging and prompt reference ordering.
- [x] Connect/disconnect/unexpected-close/reconnect state controls.
- [x] Android API 36 build, install, launch, offline screenshot/hierarchy evidence.
- [x] Mobile adapter/UI suite, shared replay suite, typecheck, mobile build, diff check.

## Pending external prerequisites

- [ ] Backend: allow the selected exact app-claimed HTTPS native PKCE callback; preserve strict redirect validation.
- [ ] Ingress: provide a trusted HTTPS hostname/certificate whose served SAN matches the mobile endpoint and association files.
- [ ] macOS: implement and runtime-verify iOS Keychain Capacitor bridge using Xcode and simulator/device.
- [ ] macOS: run authenticated native PKCE → REST → WS-ticket → WSS end-to-end after backend/ingress prerequisites.

## Evidence

See `evidence/` and `docs/mobile-macos-handoff.md`.
