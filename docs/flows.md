# Flows

Target runtime decisions. Implementation gaps require explicit OpenSpec changes.

## Capture, interpretation, and publication

One input may create both an immutable Entry and an Event. Publication is always atomic.

```mermaid
sequenceDiagram
    participant Connector
    participant Capture
    participant Queue
    participant Interpreter
    participant Reviews
    participant Knowledge

    Connector->>Capture: Entry and/or external Event
    Capture-->>Connector: committed identity
    Capture->>Queue: enqueue Interpretation
    Queue->>Interpreter: input + selected context
    Interpreter->>Interpreter: knowledge + Item, State, Automation and Intent declarations
    alt consequential reference is ambiguous
        Interpreter->>Reviews: open referenceResolution
        Reviews-->>Interpreter: selected Item or confirmed proposal
    end
    Interpreter->>Knowledge: validate and publish knowledge atomically
    Interpreter->>Knowledge: publish declarations in dependency order through domain commands
```

Simple connections use typed references; relationships requiring their own evidence or history are Items.

## Review and conflict resolution

`referenceResolution` resolves identity ambiguity, not mutation approval. Conflicting evidence is preserved.
Pending Reviews SHALL remain visible to the launcher until resolved.

```mermaid
flowchart LR
    Draft[Complete interpretation draft] --> Validate{Structurally valid?}
    Validate -- no --> Fail[Fail interpretation]
    Validate -- yes --> Ambiguous{Consequential ambiguity?}
    Ambiguous -- yes --> Review[referenceResolution Review]
    Review --> Resolve[Select existing Item or confirm proposal]
    Resolve --> Publish[Atomic publication]
    Ambiguous -- no --> Publish
```

## Knowledge and State evaluation

Knowledge emerges from Items and Components. State may be observed, believed, desired, required, forbidden, or predicted.

```mermaid
flowchart LR
    Inputs[Items + Components + Events + time] --> Snapshot[Knowledge snapshot]
    Persisted[Non-derivable modal State] --> Evaluator[State evaluator]
    Snapshot --> Evaluator
    Evaluator --> Current[Current and unresolved State]
    Evaluator --> Planning[Planning projections]
    Evaluator --> Automations[Automation dependency index]
    Evaluator --> Detectors[Proactive detectors]
```

State is derived by default and persisted only when it cannot be reconstructed.

## Declarative Automation evaluation

Automations use closed `Given / When / Then` declarations and never call Capabilities directly.

```mermaid
flowchart LR
    Trigger[Time, Event, or State change] --> Match[Match indexed Automations]
    Match --> Given{Given holds?}
    Given -- no --> Wait[Remain eligible]
    Given -- yes --> Controls[Apply cooldown, expiry, stop, priority, dedupe]
    Controls --> Intent[Create validated Intent]
```

## Intent execution and observation

Intent proposes; Capability executes; Attempt records the try; Event records the outcome.

```mermaid
sequenceDiagram
    participant Source as User, Automation, or detector
    participant Intents
    participant Policy as Authorization and autonomy
    participant Capability
    participant Adapter
    participant State

    Source->>Intents: propose Intent
    Intents->>Policy: validate input and current conditions
    Policy->>Capability: authorize eligible execution
    Capability->>Capability: create idempotent Attempt
    Capability->>Adapter: perform effect
    Adapter-->>Capability: observed outcome
    Capability->>State: publish outcome Event
    State-->>Intents: expected, failed, uncertain, stale, or cancelled State
```

Conditions are reevaluated before every Attempt. A Capability's safety ceiling always limits autonomy.

## Profile composition and task planning

Tasks, objectives, plans, and habits are Item compositions, not separate storage models.

```mermaid
flowchart LR
    Capture[Entry or explicit proposal] --> Profile[Profile contract]
    Profile --> Compose[Required and optional Components + defaults]
    Profile --> Lifecycle[Lifecycle transitions]
    Profile --> State[Persisted State templates]
    Compose --> State
    State --> Views[Next actions, blockers, unscheduled work, progress]
    Views --> Automations[Automations and proactive detectors]
    Automations --> Intents[Suggested or authorized Intents]
```

## Launcher notifications

Deadline and reminder cadence are independent.

```mermaid
flowchart LR
    Entry[Notification declaration] --> Structure[Subject Item + temporal Components]
    Structure --> Automation[One scheduled Automation with all occurrences]
    Automation --> Intent[Notification Intent]
    Intent --> Capability[Notification Capability]
    Capability --> Attempt[Delivery Attempt]
    Attempt --> Event[Delivery Event]
    Event --> State[Observed State]
    State --> Automation
```

The launcher uses a dedicated notification API. Reads derive the active list from Automations, Intents and State; completing or dismissing an item records the corresponding State and removes it from the active view. No Notification or Reminder entity or compatibility API exists.

## Retry policy

Each operation allows at most three increasingly delayed attempts. Transient outages use backoff, quota limits honor provider reset or `Retry-After`, and invalid responses become visible failures rather than rapid retries. Retry state remains inside the Wingman process.

## Proactive assistance

Every proactive proposal carries evidence, rationale, urgency, and expiration.

```mermaid
flowchart LR
    Context[Knowledge + State + Events] --> Detect[Deterministic detectors]
    Detect --> Explain[Explainable proposal]
    Explain --> Autonomy{Allowed autonomy?}
    Autonomy -- ask --> User[Request confirmation]
    Autonomy -- propose or execute --> Intent[Intent]
    User --> Intent
    Intent --> Feedback[Accepted, rejected, postponed, completed]
    Feedback --> Preferences[Future prioritization]
```

Inference may structure or rank proposals, but cannot mutate or execute directly.

## Runtime lifecycle

`main.ts` delegates lifecycle to `Runtime`; infrastructure remains behind ports.
Production runs as one long-lived Railway service; HTTP, interpretation, scheduling and execution stay in the same process.

```mermaid
flowchart LR
    Config[Configuration] --> Main[main.ts]
    Main --> Runtime[Runtime]
    Runtime --> API[HTTP server]
    Runtime --> Interpretation[Interpretation worker]
    Runtime --> Scheduler[Automation scheduler]
    Runtime --> Execution[Intent execution worker]
    Runtime --> System[System policies]
    Runtime --> Storage[Storage adapters]
    Runtime --> Connectors[Capability adapters]
```
