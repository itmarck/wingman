## Why

Reminders provide the first concrete vertical proof that captured knowledge, tasks, State, Rules, Intents, Capabilities, Attempts, and Events work together safely.

## What Changes

- Add a notification Capability behind a provider-independent port and a test adapter before any production delivery adapter.
- Interpret reminder requests into tasks or referenced subjects, temporal constraints, reminder Rules, and notification Intent templates.
- Keep deadlines separate from reminder cadence and support repeated occurrences, quiet hours, stopping conditions, expiration, and deduplication.
- Stop stale reminders when the related State changes and preserve delivery Attempts and outcome Events.

## Capabilities

### New Capabilities

- `reminder-workflow`: Capture, schedule, authorize, deliver, stop, retry, and explain reminders end to end.

### Modified Capabilities

None.

## Impact

- Requires archived knowledge, State, Intent, Rule, and task-planning changes.
- Adds reminder interpretation, notification capability contracts, scheduling projections, API behavior, and end-to-end tests.

