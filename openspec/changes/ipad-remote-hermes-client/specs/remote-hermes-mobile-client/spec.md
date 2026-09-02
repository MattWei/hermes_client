# Remote Hermes mobile client

## ADDED Requirements

### Requirement: Mobile builds isolate remote-client execution

The mobile entrypoint SHALL render a Capacitor remote-client interface without starting Electron, a local Hermes agent, Python, Shell, local gateway bootstrap, or child-process path.

#### Scenario: Launch mobile build without a backend

- **WHEN** the application is built with `VITE_MOBILE_HOME=1` and launched without connection settings
- **THEN** it displays the offline mobile surface
- **AND THEN** it does not initiate a network connection or local backend startup.

### Requirement: LAN connections require explicit constrained opt-in

The mobile client SHALL accept LAN HTTP/WS only for a literal RFC1918 IPv4 backend, a supplied static token, and an explicit cleartext-risk confirmation. It SHALL not fall back from secure HTTPS/WSS to LAN HTTP/WS.

#### Scenario: Reject an unsafe LAN endpoint

- **WHEN** a user selects LAN mode with a hostname, public address, loopback address, IPv6 address, embedded credentials, missing token, or missing risk confirmation
- **THEN** the client rejects the connection before creating a REST or WebSocket transport.

### Requirement: Mobile session activity is scoped to the active runtime session

The mobile client SHALL only render prompts, approvals, tool activity, and replay recovery for the active runtime session. Stored session identity SHALL remain distinct from runtime session identity.

#### Scenario: Event belongs to another runtime session

- **WHEN** the gateway emits a session-scoped event whose `session_id` differs from the active runtime session
- **THEN** the client ignores it
- **AND THEN** it does not alter the visible transcript, approval card, tool activity, or history.

### Requirement: Credential storage is platform-native

The mobile client SHALL use a native secure credential store and SHALL not store tokens, PKCE values, Basic credentials, session cookies, or WebSocket tickets in Web Storage or Capacitor Preferences.

#### Scenario: Store a LAN credential on Android

- **WHEN** Android persists a connection credential
- **THEN** the secure store encrypts it using AndroidKeyStore-backed cryptography
- **AND THEN** no plaintext credential is written to ordinary Web Storage.
