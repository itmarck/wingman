## Context

Notification delivery currently uses generic Automations and Intents but is exposed through a reminder-named compatibility module and API. Existing Events already record capability outcomes, so another persisted entity would duplicate lifecycle state.

## Goals / Non-Goals

**Goals:** expose a compact launcher inbox, remove reminder vocabulary, and preserve traceability with existing semantic records.

**Non-Goals:** complete subject tasks, add external delivery channels, or silently alter explicit schedules.

## Decisions

1. A notification identity is derived from its notification Intent. Delivery and acknowledgement are immutable Events causally linked to that Intent. This avoids a Notification table and the opaque State literals used by the compatibility facade.
2. The notification module owns a read model over execution and Automation stores. HTTP exposes list, read and acknowledge only; schedule changes stay with Automation operations.
3. The active view filters acknowledged notices and compacts equivalent delivered notices by subject and message, selecting criticality, priority and recency deterministically. Compaction hides redundant rows but does not mutate schedules.
4. Notification delivery is an internal launcher capability. No outbound notification port or provider adapter remains until a real delivery channel is required.
5. Reminder routes, module names and input fields are removed outright because there is no production data or compatibility requirement.

## Risks / Trade-offs

- [A hidden lower-priority notice may still matter] → Inspection remains possible through execution evidence and compaction is limited to equivalent subject/message notices.
- [Derived queries may become expensive] → Keep the first implementation in memory and introduce a projection only after measured need.
- [Acknowledgement could be mistaken for completion] → Use a dedicated Event type and never invoke a subject Capability.

## Migration Plan

Replace reminder composition and routes, update built-in profiles and tests, then remove the compatibility files. No data migration is required.
