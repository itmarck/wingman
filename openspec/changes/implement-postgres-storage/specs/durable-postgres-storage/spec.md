## Purpose

Preserve Wingman's generic knowledge and automation behavior across process restarts through one transactional PostgreSQL boundary without making domain code depend on storage technology.

## ADDED Requirements

### Requirement: Explicit durable boundary
PostgreSQL storage SHALL preserve Entries, Items, Component revisions, Interpretation runs, Reviews, persisted State, Automations and evaluations, Intents, Attempts, Events, declaration outcomes, and Suggestions. Code-owned registries, derived projections, detector definitions, and pending approval callbacks SHALL remain non-durable.

#### Scenario: Process restarts
- **WHEN** the process restarts after committed domain work
- **THEN** every durable fact and recoverable operational state remains available through the same system operations

#### Scenario: Development approval is pending
- **WHEN** the process restarts with an unapplied approval callback
- **THEN** that callback is discarded without creating or changing durable domain data

### Requirement: Storage-independent behavior
Memory and PostgreSQL storage SHALL implement the same domain ports and preserve equivalent observable behavior, validation, ordering, pagination, and immutable value semantics.

#### Scenario: Principal workflow uses either adapter
- **WHEN** the same valid Entry workflow runs against memory and PostgreSQL
- **THEN** both produce equivalent statuses, knowledge, Reviews, Automations, Intents, notifications, and projections

#### Scenario: Stored value is loaded
- **WHEN** PostgreSQL reconstructs a domain value
- **THEN** it validates current closed contracts and does not expose mutable database or driver values to the domain

### Requirement: Atomic compound transitions
Capture, Interpretation publication, Review publication and resolution, and other multi-record domain transitions SHALL commit completely or leave no partial durable effects.

#### Scenario: Publication fails after writing begins
- **WHEN** any Item, Component, State, Automation, Intent, outcome, or status write in one publication fails
- **THEN** the entire publication rolls back and the previous recoverable Interpretation state remains intact

#### Scenario: Entry is captured
- **WHEN** a new Entry and its initial Interpretation are accepted
- **THEN** both become durable in one transaction or neither does

### Requirement: Immutable facts and guarded lifecycle changes
Immutable facts SHALL be inserted without in-place replacement, while mutable lifecycle records SHALL allow only valid expected-state transitions and report conflicts when concurrent state has changed.

#### Scenario: Concurrent lifecycle update
- **WHEN** two operations attempt incompatible transitions from the same stored state
- **THEN** at most one commits and the other receives a conflict without overwriting the winner

#### Scenario: Existing immutable identity is reused incompatibly
- **WHEN** a write supplies an existing identity with different immutable content
- **THEN** storage rejects the write instead of replacing history

### Requirement: Durable work coordination
Interpretation, Automation, and Intent work SHALL use durable claims, leases, unique idempotency identities, or equivalent atomic coordination so concurrent workers and restarts do not produce duplicate effects.

#### Scenario: Workers claim Interpretation work concurrently
- **WHEN** multiple workers request available Interpretation work
- **THEN** each run is claimed by at most one active lease without blocking unrelated available work

#### Scenario: Worker disappears
- **WHEN** a worker stops after claiming work and its lease expires
- **THEN** another worker can recover the work while retaining prior attempt history

#### Scenario: Automation occurrence is evaluated again
- **WHEN** the same Automation occurrence is observed concurrently or after restart
- **THEN** its deduplication identity allows at most one committed set of produced Intents and one durable evaluation outcome

#### Scenario: Intent execution races
- **WHEN** execution of the same Intent is requested concurrently
- **THEN** one Attempt reserves the executable transition and duplicate capability invocation is prevented by the stable idempotency contract

### Requirement: Current generic relational schema
The final schema SHALL represent current generic domain contracts and SHALL NOT retain active Reminder entities, request-kind unions, or obsolete authorization lifecycle vocabulary.

#### Scenario: Current migrations finish
- **WHEN** all repository migrations run on a supported PostgreSQL database
- **THEN** the resulting constraints and indexes accept current Profile, Component, consent, declaration, Automation, and notification contracts

#### Scenario: New use case is persisted
- **WHEN** an Item or Automation represents planning, shopping, travel, or another supported domain
- **THEN** storage uses the same generic Item, Component, State, Automation, and Intent structures without a case-specific table

### Requirement: Query-oriented indexing
Durable storage SHALL index identity, current Component lookup, Entry history, pending Reviews, available Interpretation claims, due Automations, Intent status, execution history, and Suggestion status without duplicating domain truth.

#### Scenario: Runtime reads pending work
- **WHEN** the worker or launcher requests pending work from a growing dataset
- **THEN** PostgreSQL can select the relevant ordered subset without scanning unrelated domain records
