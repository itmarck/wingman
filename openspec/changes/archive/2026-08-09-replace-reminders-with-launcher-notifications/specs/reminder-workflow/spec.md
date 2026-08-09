## REMOVED Requirements

### Requirement: Reminder interpretation
**Reason**: Notification requests use generic Entry declarations, Automations and launcher notification views; reminder is no longer a product entity or API.
**Migration**: Submit Entries and consume `/api/notifications`.

### Requirement: Repeated and imprecise timing policy
**Reason**: The behavior is covered by declarative Automations and notification occurrence contracts.
**Migration**: Use one notification Automation with explicit occurrences.

### Requirement: Stale reminder prevention
**Reason**: State reevaluation is an Automation and Intent execution invariant, not reminder-specific behavior.
**Migration**: Declare State conditions on the Automation and Intent template.

### Requirement: Reminder explanation and control
**Reason**: The reminder compatibility view is replaced by the launcher notification view and Automation lifecycle.
**Migration**: Inspect notifications through `/api/notifications` and schedules through Automation APIs.

### Requirement: Entry declaration idempotency
**Reason**: Declaration idempotency remains a generic Entry publication requirement.
**Migration**: No caller action is required.
