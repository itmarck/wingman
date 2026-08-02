## Why

The generic kernel needs native planning compositions so Wingman can represent commitments, objectives, plans, habits, dependencies, and progress without introducing separate incompatible subsystems.

## What Changes

- Add unqualified immutable Profiles and Components for tasks, objectives, plans, habits, temporal constraints, assignment, dependency, and progress.
- Represent lifecycle values through closed Profile-specific state machines.
- Represent current and desired planning conditions through State.
- Expose projections for actionable next steps, blockers, unscheduled work, and objective progress.

## Capabilities

### New Capabilities

- `task-planning`: Create, compose, relate, transition, and query tasks, objectives, plans, habits, dependencies, and progress.

### Modified Capabilities

None.

## Impact

- Requires archived composable knowledge and State evaluation changes.
- Adds planning schemas, operations, projections, APIs, and behavior tests; it does not send notifications or act autonomously.

