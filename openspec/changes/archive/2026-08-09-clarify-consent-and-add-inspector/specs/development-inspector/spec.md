## Purpose

Give developers one compact visual explanation of Wingman's current in-memory data and process relationships without adding persistent entities or production exposure.

## ADDED Requirements

### Requirement: Development-only inspector
The system SHALL expose the inspector document and snapshot only outside production and SHALL register neither route when `NODE_ENV=production`.

#### Scenario: Development server
- **WHEN** the server runs outside production
- **THEN** a developer can open the inspector without authentication and read its runtime snapshot

#### Scenario: Production server
- **WHEN** the server runs with `NODE_ENV=production`
- **THEN** inspector document and data routes return not found

### Requirement: Generic runtime snapshot
The inspector snapshot SHALL represent current runtime entities as generic nodes, relationships as edges, and chronological activity as events without creating or changing domain data.

#### Scenario: Runtime contains interpreted work
- **WHEN** the inspector reads a system containing Entries, Items, Automations or Intents
- **THEN** the snapshot connects their observable relationships and includes relevant status and timing

### Requirement: Compact dark interface
The inspector document SHALL render overview, graph and activity views with a black default shadcn-style visual language and no frontend runtime dependency.

#### Scenario: Empty runtime
- **WHEN** no user data exists
- **THEN** the page remains usable and clearly reports an empty system
