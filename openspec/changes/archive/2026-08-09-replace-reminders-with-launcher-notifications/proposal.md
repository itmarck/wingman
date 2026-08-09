## Why

The launcher needs a small actionable notification inbox, while the current reminder compatibility surface preserves obsolete product terminology and exposes more active notices than necessary.

## What Changes

- **BREAKING** Remove the `/reminders` API, Reminder module and remaining reminder identifiers without compatibility aliases.
- Add a dedicated launcher notification API derived from Automations, Intents and Events, without a Notification entity.
- Let the launcher list, inspect and acknowledge notifications; acknowledging a notice does not complete its subject Item.
- Minimize active notifications by deduplicating, suppressing or deferring lower-priority notices within safe time thresholds.
- Never move explicit deadlines, user-selected instants or critical notices without authorization.
- Keep notification actions and lifecycle inside existing semantic contracts unless a new field is strictly required.

## Capabilities

### New Capabilities

- `launcher-notifications`: Active notification views, acknowledgement, explanation and compact prioritization for the launcher.

### Modified Capabilities

- `declarative-automations`: Notification scheduling must expose stable occurrence identity, priority and safe deferral behavior.
- `intent-execution`: Notification delivery and acknowledgement remain distinct observed outcomes without invoking unrelated actions.
- `reminder-workflow`: Retire every reminder-specific API and behavior in favor of launcher notifications.

## Impact

Breaking HTTP and system-module changes affect notification routes, capability input, runtime composition, OpenAPI, tests, quality cases and documentation. The core Item, Component, State, Automation and Intent storage model remains unchanged.
