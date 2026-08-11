# proactive-assistance Specification

## Purpose

Enable Wingman to use knowledge and planning State to identify actionable risks and opportunities and propose timely help without exceeding explicit autonomy.

## Requirements

### Requirement: Deterministic proactive detectors
The system SHALL detect configured missing next actions, blockers, approaching deadlines, inactivity, conflicts, and relevant new knowledge or Events from explicit dependencies.

#### Scenario: Objective lacks next action
- **WHEN** an active objective has no actionable next task
- **THEN** the applicable detector may propose a planning Intent

### Requirement: Explainable suggestions
Every proactive Suggestion SHALL identify its detector or Automation, relevant State, evidence, rationale, urgency, expected effect, and expiration.

#### Scenario: Blocked plan suggestion
- **WHEN** a high-priority plan remains blocked beyond its review window
- **THEN** the Suggestion explains the blocker, elapsed time, affected objective, and suggested action

### Requirement: Autonomy-controlled assistance
Proactive behavior SHALL resolve global, Capability and user autonomy independently from explicit Intent consent and SHALL NOT exceed the Capability safety ceiling.

#### Scenario: Suggestion and execution differ
- **WHEN** the same risk could produce a notification or a consequential external mutation
- **THEN** each Intent follows its own Capability policy and the mutation is not executed without required consent

### Requirement: Suggestion feedback
The system SHALL preserve accepted, rejected, modified, postponed, expired, and completed Suggestion outcomes without interpreting rejection as permission for unrelated behavior.

#### Scenario: Suggestion postponed
- **WHEN** the user postpones a Suggestion
- **THEN** the Suggestion records the new review time and does not repeatedly interrupt before then

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

### Requirement: Proactivity remains bounded
Inference SHALL NOT invent executable operators or Capabilities and proactive evaluation SHALL NOT directly mutate State or invoke adapters.

#### Scenario: Unsupported inferred action
- **WHEN** inference suggests an effect without a registered Capability
- **THEN** the effect is rejected without execution and remains available only as explanatory narrative if useful

