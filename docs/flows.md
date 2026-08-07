# Flows

Target runtime flows; the implementation may retain legacy behavior until the related OpenSpec changes are archived.

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
    Interpreter->>Interpreter: draft Items, Components, Profiles, references, evidence
    alt consequential reference is ambiguous
        Interpreter->>Reviews: open referenceResolution
        Reviews-->>Interpreter: selected Item or confirmed proposal
    end
    Interpreter->>Knowledge: validate and publish complete draft atomically
```

Simple connections use typed references; relationships requiring their own evidence or history are Items.

## Review and conflict resolution

`referenceResolution` resolves identity ambiguity, not workflow approval. Conflicting evidence is preserved.

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

## Task planning

Tasks, objectives, plans, and habits are Item compositions, not separate storage models.

```mermaid
flowchart LR
    Capture[Entry or explicit proposal] --> Compose[Planning Item + Profile + Components]
    Compose --> State[Current and desired State]
    State --> Views[Next actions, blockers, unscheduled work, progress]
    Views --> Automations[Automations and proactive detectors]
    Automations --> Intents[Suggested or authorized Intents]
```

## Reminder workflow

Deadline and reminder cadence are independent.

```mermaid
flowchart LR
    Entry[Reminder request] --> Structure[Task or subject + temporal Components]
    Structure --> Automation[Reminder Automation]
    Automation --> Intent[Notification Intent]
    Intent --> Capability[Notification Capability]
    Capability --> Attempt[Delivery Attempt]
    Attempt --> Event[Delivery Event]
    Event --> State[Observed State]
    State --> Automation
```

Completion stops stale reminders; retries create new Attempts without duplicating the logical notification.

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
