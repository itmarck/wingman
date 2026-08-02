## Purpose

Provide a repeatable end-to-end verification of Wingman through its authenticated HTTP API using only fresh in-memory state and deterministic local adapters.

## ADDED Requirements

### Requirement: Isolated in-memory execution
The system SHALL provide a smoke command that starts the real HTTP API with memory storage, local deterministic inference, and non-delivering notification adapters, without reading a database URL or contacting an external service.

#### Scenario: Run without infrastructure
- **WHEN** a developer runs the smoke command in an environment containing only the project dependencies
- **THEN** the API starts, processes the configured Entry bank, reports results, closes cleanly, and performs no database migration, database write, remote inference, or external notification

### Requirement: Fresh state per run
Every smoke invocation SHALL own a new system instance and SHALL close all workers, servers, stores, and timers before exiting.

#### Scenario: Repeat the smoke test
- **WHEN** the smoke command is executed twice with the same Entry bank
- **THEN** both runs begin empty, produce the same normalized semantic results, and share no Entry, Item, Rule, Intent, reminder, proposal, or delivery state

### Requirement: Semantic workflow report
The smoke report SHALL include capture and processing outcomes, derived planning and reminder behavior, unresolved requests, unexpected effects, API failures, and expectation mismatches for every Entry.

#### Scenario: Entry silently produces no workflow
- **WHEN** an Entry expected to create a task or reminder reaches a terminal processing state without that effect
- **THEN** the smoke command fails and identifies the Entry and missing semantic outcome

### Requirement: Configurable Entry bank
The smoke command SHALL accept a UTF-8 Markdown Entry bank and SHALL assign deterministic per-run external identities without changing the source file.

#### Scenario: Read Spanish entries
- **WHEN** the command reads `docs/entries.md`
- **THEN** accents and quotations are preserved, template placeholders are replaced with deterministic test values before capture, Wingman receives only materialized Entries, and the source document remains unchanged
