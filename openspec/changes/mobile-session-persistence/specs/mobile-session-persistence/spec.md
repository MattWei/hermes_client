## ADDED Requirements

### Requirement: A dropped socket is a reconnect, not a sign-out
The mobile surface SHALL re-establish its gateway connection when the transport closes, using credentials the platform already holds, before it presents the sign-in form.

#### Scenario: The app returns after being backgrounded
- **WHEN** the app is suspended and the gateway socket is closed while it is away
- **THEN** returning to the foreground re-dials the gateway without asking for a password
- **AND** the conversation and session list the person had are still on screen

#### Scenario: The gateway reports the socket closed while the app is open
- **WHEN** the socket reports `closed` or `error`
- **THEN** the surface attempts a reconnect and keeps the connected shell mounted while it does

### Requirement: The stored session cookie is preferred over stored credentials
The surface SHALL attempt a reconnect with the credential the platform already holds — the LAN session token, or a WebSocket ticket minted against the existing dashboard cookie — before it consults a stored password.

#### Scenario: A cookie-only launch
- **WHEN** the app launches with no stored password but a live dashboard cookie
- **THEN** it reconnects and shows the connected surface
- **AND** no sign-in form is shown

#### Scenario: The cookie has expired
- **WHEN** the gateway refuses the ticket request with 401 or 403
- **THEN** the surface falls back to any stored credentials
- **AND** if none exist it shows the sign-in form with a message saying the session ended

### Requirement: Signing out is the only action that ends the session
The surface SHALL NOT present the sign-in form because of a transport failure alone, and an explicit sign-out SHALL stop the next launch from reconnecting on its own.

#### Scenario: The person signs out
- **WHEN** sign-out is chosen
- **THEN** the socket is closed without triggering a reconnect
- **AND** the remembered gateway address is forgotten, so the next launch starts at the form

#### Scenario: Reconnect is attempted more than once
- **WHEN** the gateway reports the same dead socket repeatedly
- **THEN** only one recovery runs at a time
