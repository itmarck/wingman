## Why

The reactive `Rule` name hides that the construct is an Automation that produces Intents, interpretation behavior is authored as one difficult prose block, and reminders model interruptive quiet hours even though notifications are passive launcher items.

## What Changes

- **BREAKING**: Rename Rule to Automation across code, API, persistence, documentation, and evaluation output.
- Remove quiet-hours behavior and document notifications as passive launcher availability.
- Define interpretation through small internal TypeScript Policies and render model guidance from the enabled set.
- Keep Policies code-owned and outside Entries, HTTP mutation, Items, and PostgreSQL.

## Capabilities

### New Capabilities

- `declarative-automations`: Reactive Given/When/Then definitions that only produce Intents.
- `interpretation-policy`: Code-owned declarative Policies used to construct interpretation requests.

### Modified Capabilities

- `declarative-rules`: Retire the Rule vocabulary and contract.
- `reminder-workflow`: Remove interruptive controls and expose passive notifications.

## Impact

Renames core and module paths, `/api/rules` to `/api/automations`, proposer vocabulary, evaluation output, and functional persistence names. It removes `quietHours`, renames telemetry `instructions_version` to `policy_version`, and adds no Policy persistence or external mutation surface.
