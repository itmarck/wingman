# Flows

## Capture and asynchronous processing

The Connector receives either an Entry identity or a Proposal immediately. Once committed, the
queued Interpretation continues asynchronously with selected context.

```mermaid
sequenceDiagram
    participant Connector
    participant Capture
    participant Lifecycle
    participant Queue
    participant Worker
    participant Interpreter

    Connector->>Capture: capture Entry
    Capture->>Lifecycle: Entry + initial Interpretation
    Lifecycle-->>Capture: atomic commit
    Capture-->>Connector: Entry identity
    Queue->>Worker: claim queued Interpretation
    Worker->>Interpreter: Entry + selected context
    Interpreter-->>Worker: knowledge | empty | invalid | error
```

## Interpretation state

Temporary failures return to the queue, ambiguities wait for human review, and permanent outcomes preserve their final state.

```mermaid
stateDiagram-v2
    [*] --> queued
    queued --> processing
    processing --> pending: reviews required
    processing --> completed: finished successfully
    processing --> failed: permanent failure
    processing --> exhausted: retries exhausted
    processing --> queued: temporary failure
    pending --> completed: all reviews resolved
    failed --> queued: manual retry
    exhausted --> queued: manual retry
```

## Review and publication

The complete Draft is validated first; any ambiguity pauses publication until every Review is resolved, then all knowledge is committed atomically.

```mermaid
flowchart TD
    Draft[Validate complete Draft]
    Valid{Valid?}
    Ambiguous{Ambiguities?}
    Reviews[Create independent Reviews]
    Resolve[Resolve every Review]
    Publish[Publish knowledge atomically]
    Complete[Complete Interpretation]
    Fail[Fail Interpretation]

    Draft --> Valid
    Valid -- no --> Fail
    Valid -- yes --> Ambiguous
    Ambiguous -- no --> Publish
    Ambiguous -- yes --> Reviews
    Reviews --> Resolve
    Resolve --> Publish
    Publish --> Complete
```

Knowledge is never partially published. The final Review, publication, and completed
Interpretation share one atomic operation.

## Mutation control

Mutation is controlled at two independent boundaries:

- `X-Mutation-Mode` controls the current HTTP request and defaults to `readonly`.
- `MUTATION_MODE` controls background Interpretation mutations and defaults to `approval`.

Both use the same in-memory Proposal registry when their effective mode is `approval`.

```mermaid
sequenceDiagram
    participant Connector
    participant API
    participant Proposals
    participant Queue
    participant Worker
    participant Interpreter
    participant Store

    Connector->>API: POST Entry with X-Mutation-Mode: approval
    API->>Proposals: Entry + initial Interpretation
    Proposals-->>Connector: Proposal and approval URL
    Connector->>API: approve capture Proposal
    API->>Store: commit Entry + Interpretation
    Store->>Queue: enqueue Interpretation
    Queue->>Worker: claim
    Worker->>Interpreter: interpret Entry
    Interpreter-->>Worker: processed Draft
    Worker->>Proposals: exact publication changes
    Note over Worker,Proposals: Worker waits and renews its lease
    Connector->>API: list and approve publication Proposal
    API->>Store: atomic publication
    Store-->>Worker: committed
    Worker->>Queue: complete claim
```

Rejecting the asynchronous Proposal releases the waiting worker as a failed Interpretation.
Pending Proposals have no timer and disappear when approved, rejected, or when the process stops.

## Runtime lifecycle

`main.ts` only composes dependencies and delegates process lifecycle to `Runtime`.

```mermaid
flowchart LR
    Config[Configuration]
    Main[main.ts]
    Runtime[Runtime]
    Server[HTTP Server]
    Worker[Interpretation Worker]
    System[System]
    Database[PostgreSQL]

    Config --> Main
    Main --> Runtime
    Runtime --> Server
    Runtime --> Worker
    Runtime --> System
    Runtime --> Database
```

The HTTP lifecycle is framework-independent at this boundary. PostgreSQL currently stores inference
telemetry; functional knowledge remains in memory.
