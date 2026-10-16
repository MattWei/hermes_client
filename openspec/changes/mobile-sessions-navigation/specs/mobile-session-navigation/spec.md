# Mobile session navigation

## ADDED Requirements

### Requirement: Mobile lists sessions before a conversation is opened

The mobile client SHALL present a session list as the entry view once a gateway is connected, and
SHALL NOT require a separate manual refresh for that list to appear.

#### Scenario: Gateway connects successfully

- **WHEN** a LAN gateway connection succeeds
- **THEN** the client loads the session list automatically
- **AND THEN** the user can open a stored session or start a new one from that view.

#### Scenario: No gateway is connected

- **WHEN** the client has no gateway connection
- **THEN** it shows the connection surface
- **AND THEN** it does not attempt to list sessions.

### Requirement: Session detail is a distinct view with a way back

The mobile client SHALL render an open session as its own view, separate from the session list,
and SHALL provide navigation back to the list without dropping the gateway connection.

#### Scenario: Open a stored session and return

- **WHEN** the user opens a stored session from the list
- **THEN** the detail view shows that session's transcript and composer
- **AND WHEN** the user navigates back
- **THEN** the list is shown again with the gateway still connected.

### Requirement: The mobile entry does not adopt the desktop shell

The mobile entry SHALL NOT import the desktop route model, the pane shell, or the plugin registry.

#### Scenario: Mobile build is produced

- **WHEN** the mobile bundle is built with `VITE_MOBILE_HOME=1`
- **THEN** no desktop shell, pane-tree, or plugin-registry module is part of the mobile entry
  graph.

### Requirement: Rich transcript rendering stays off the boot path

When rich markdown rendering is enabled, the mobile client SHALL load the syntax highlighter and
the diagram renderer lazily, so the cold-start path does not include them.

#### Scenario: Session opens with a code block

- **WHEN** a transcript containing a code block is displayed
- **THEN** the highlighter chunk is loaded on demand
- **AND THEN** the initial application start does not load it.

### Requirement: A session is labelled consistently wherever it appears

The mobile client SHALL identify an open session by the same label in the sidebar row and in the
header above its transcript, falling back through the session's title, then its preview, then a
placeholder.

#### Scenario: Session the backend never auto-titled

- **WHEN** a session has a preview but no title
- **THEN** both the sidebar row and the header above the transcript show the preview
- **AND THEN** the placeholder is not shown for that session.

#### Scenario: Session with a title

- **WHEN** a session has a title
- **THEN** both the sidebar row and the header above the transcript show the title.

#### Scenario: Session the backend has no row for yet

- **WHEN** a session has just been created and is open, and the backend has not persisted a row for
  it (it writes one on the first turn)
- **THEN** the header above the transcript labels it with the same placeholder the list uses for a
  session with nothing to show
- **AND THEN** the header does not read as though no session were open.
