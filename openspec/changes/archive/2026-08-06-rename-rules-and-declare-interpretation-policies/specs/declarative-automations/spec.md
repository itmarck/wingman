## Purpose

Provide deterministic reactive Automations that observe time, Events, and State while producing only validated Intent templates.

## ADDED Requirements

### Requirement: Declarative Automation contract
An Automation SHALL define Given conditions, one When trigger, Then Intent templates, and optional runtime controls through closed registered contracts.

#### Scenario: Trigger is satisfied
- **WHEN** an Automation trigger occurs and every Given condition is satisfied
- **THEN** the Automation creates its validated Intent templates without invoking a Capability

### Requirement: Dependency-driven evaluation
The system SHALL evaluate Automations only from declared State or Event dependencies or their next evaluation time and SHALL preserve deduplication and evaluation outcomes.

#### Scenario: Unrelated State changes
- **WHEN** State unrelated to an Automation changes
- **THEN** the Automation is not evaluated

### Requirement: Automation lifecycle
Automations SHALL support active, paused, and stopped lifecycle states plus explicit repetition, expiration, cooldown, occurrence, stopping, priority, and deduplication controls.

#### Scenario: Stopping condition is satisfied
- **WHEN** an active Automation reaches its stopping condition
- **THEN** it becomes stopped and produces no later Intent
