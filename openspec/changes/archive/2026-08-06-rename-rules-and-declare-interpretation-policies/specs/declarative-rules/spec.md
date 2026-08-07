## REMOVED Requirements

### Requirement: Given When Then contract
**Reason**: The reactive primitive is renamed to Automation.
**Migration**: Use `declarative-automations` and `/api/automations`.

### Requirement: Closed trigger and condition language
**Reason**: The contract is preserved by Automation.
**Migration**: Use registered Automation triggers and Conditions.

### Requirement: Explicit scheduling policies
**Reason**: Scheduling fields become Automation controls rather than Rule policy.
**Migration**: Supply `controls` when registering an Automation.

### Requirement: Dependency-driven evaluation
**Reason**: The Automation worker owns dependency evaluation.
**Migration**: Use Automation dependencies and evaluations.

### Requirement: Rules cannot execute effects
**Reason**: The same safety boundary now belongs to Automation.
**Migration**: Automations only produce Intents.
