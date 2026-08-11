## MODIFIED Requirements

### Requirement: Suggestion API vocabulary
The authenticated API and system-facing contracts SHALL expose proactive assistance exclusively as Suggestions and SHALL reserve Proposal vocabulary for pending technical mutations. The system SHALL NOT expose Proactivity or proactive-proposal aliases for Suggestion resources.

#### Scenario: Consumer lists assistance
- **WHEN** a consumer requests `/api/suggestions`
- **THEN** the system returns explainable Suggestions without exposing a Proactivity or proactive-proposal alias

#### Scenario: Consumer records feedback
- **WHEN** a consumer posts feedback to `/api/suggestions/:id/feedback`
- **THEN** the system records Suggestion feedback through the existing mutation boundary

#### Scenario: Technical mutation awaits approval
- **WHEN** a model-derived technical mutation is held by approval mode in any environment
- **THEN** it remains available as a Proposal and is not represented as a Suggestion or Intent
