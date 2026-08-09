# Database

PostgreSQL defines the durable model expected by the current domain. The runtime still uses the memory adapters for functional data; implementing the PostgreSQL adapters is the next step. Only inference telemetry is connected to PostgreSQL today.

## Functional schema

```mermaid
erDiagram
    CORE_ENTRIES ||--o{ INTERPRETATION_RUNS : receives
    CORE_ENTRIES ||--o{ INTERPRETATION_REVIEWS : originates
    CORE_ENTRIES ||--o{ EXECUTION_EVENTS : causes
    CORE_ENTRIES ||--o{ INTERPRETATION_DECLARATION_OUTCOMES : produces

    CORE_ITEMS ||--o{ CORE_COMPONENTS : composes
    CORE_COMPONENTS o|--o{ CORE_COMPONENTS : supersedes
    CORE_ITEMS o|--o{ AUTOMATION_SUGGESTIONS : subject

    INTERPRETATION_RUNS ||--o{ INTERPRETATION_REVIEWS : requires
    INTERPRETATION_RUNS ||--o| INTERPRETATION_REVIEW_LOCKS : locks

    EXECUTION_INTENTS ||--o{ EXECUTION_ATTEMPTS : executes
    EXECUTION_INTENTS ||--o{ EXECUTION_EVENTS : causes
    EXECUTION_ATTEMPTS ||--o{ EXECUTION_EVENTS : causes
    EXECUTION_INTENTS o|--o{ AUTOMATION_SUGGESTIONS : realizes

    AUTOMATION_DEFINITIONS ||--o{ AUTOMATION_DEDUPLICATIONS : remembers
    AUTOMATION_DEFINITIONS ||--o{ AUTOMATION_EVALUATIONS : evaluates
```

### Knowledge and interpretation

| Table | Purpose |
| --- | --- |
| `core_entries` | Immutable user or connector input, with external-origin idempotency. |
| `core_items` | Stable identity and optional versioned Profile. |
| `core_components` | Immutable, evidence-backed Component values and supersession history. |
| `core_assertions` | Persisted observed, believed, desired, required, forbidden or predicted State. |
| `interpretation_runs` | Interpretation history, retries, queue availability and worker leases. |
| `interpretation_reviews` | Generic `referenceResolution` questions and their decisions. |
| `interpretation_review_locks` | Durable mutual exclusion while the final Review publishes an Interpretation. |
| `interpretation_declaration_outcomes` | Idempotent result of each interpreted Item, State, Automation or Intent declaration. |

Planning does not have separate task, objective, plan or habit tables. Each planning entity is an `core_items` row whose Profile is `task`, `objective`, `plan` or `habit`; its lifecycle, temporal data, dependencies and progress are versioned Components.

### State, automations and execution

| Table | Purpose |
| --- | --- |
| `automation_definitions` | Given/When/Then Automation definition plus its current runtime cursor. |
| `automation_deduplications` | Durable occurrence and trigger idempotency for Automations. |
| `automation_evaluations` | Explainable history of Automation evaluations and produced Intent ids. |
| `execution_intents` | Conditional request to invoke a versioned Capability. |
| `execution_attempts` | Capability invocation attempts, ordered per Intent and sharing a stable idempotency key across retries. |
| `execution_events` | Immutable outcomes or occurrences with explicit causation. |

Automations only produce Intents. Attempts and Events remain separate so an uncertain external result can be represented without claiming that an action succeeded.

### Proactivity

| Table | Purpose |
| --- | --- |
| `automation_suggestions` | Explainable detector finding, autonomy decision, feedback and optional Intent. |

There is no Reminder table. A notification reminder is represented by one `automation_definitions` row with subject references and a schedule trigger; reminder reads are derived views.

The in-process mutation approval registry is not persisted. Its entries contain executable callbacks and cannot be safely restored after a restart until proposal application has a durable command contract.

Interpretation Policies are code-owned operation definitions rather than functional data. They have
no table and cannot be changed through Entries, connectors, or the HTTP API.

## Storage decisions

- Domain identities remain `text`; the domain does not require UUID-formatted ids.
- Timestamps use `timestamptz` and temporal ranges enforce `from < to` when both ends exist.
- Statuses and modalities use checked `text`, matching the closed unions in the domain.
- `JSONB` is limited to recursive domain values such as Conditions, evidence, triggers, policies and adapter payloads. These structures are validated again by domain rehydration.
- Frequently queried fields remain relational columns and have targeted indexes: queue leases, Profiles, Component lookup, due Automations, event keys, Intent status and proposal fingerprints.
- Foreign keys use restrictive deletion for immutable domain history. Cascades are limited to runtime support rows that have no independent meaning.
- `telemetry.runs` remains in the separate `telemetry` schema and is not part of functional state.
- `pgmigrations` is migration-runner metadata and is intentionally omitted from the model.

## Removed legacy tables

The replacement migration removes `concepts`, `predicates`, `axioms`, `aliases` and `links`. Their responsibilities now belong to Items, Profiles and immutable Component revisions.
