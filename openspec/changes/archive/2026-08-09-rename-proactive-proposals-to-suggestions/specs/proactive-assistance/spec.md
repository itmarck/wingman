## ADDED Requirements

### Requirement: Explainable suggestions
Every proactive Suggestion SHALL identify its detector or Automation, relevant State, evidence, rationale, urgency, expected effect, and expiration.

#### Scenario: Blocked plan suggestion
- **WHEN** a high-priority plan remains blocked beyond its review window
- **THEN** the Suggestion explains the blocker, elapsed time, affected objective, and suggested action

### Requirement: Suggestion feedback
The system SHALL preserve accepted, rejected, modified, postponed, expired, and completed Suggestion outcomes without interpreting rejection as permission for unrelated behavior.

#### Scenario: Suggestion postponed
- **WHEN** the user postpones a Suggestion
- **THEN** the Suggestion records the new review time and does not repeatedly interrupt before then

### Requirement: Suggestion API vocabulary
The authenticated API SHALL expose proactive assistance resources as Suggestions and SHALL reserve Proposal vocabulary for pending technical mutations.

#### Scenario: Consumer lists proactive assistance
- **WHEN** a consumer requests `/api/suggestions`
- **THEN** the system returns explainable Suggestions without exposing a proactive-proposal alias

#### Scenario: Consumer records feedback
- **WHEN** a consumer posts feedback to `/api/suggestions/:id/feedback`
- **THEN** the system records Suggestion feedback through the existing mutation boundary

## REMOVED Requirements

### Requirement: Explainable proposals

**Reason**: Proactive assistance is a Suggestion, while Proposal is reserved for an unapplied technical mutation.

**Migration**: Use the equivalent Explainable suggestions contract.

### Requirement: Proposal feedback

**Reason**: Feedback belongs to a Suggestion rather than a technical mutation Proposal.

**Migration**: Use the equivalent Suggestion feedback contract.
