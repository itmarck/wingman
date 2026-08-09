## 1. Profile composition contracts

- [x] 1.1 Extend Profile with optional Components, initial Component templates, lifecycle configuration and persisted State templates, including registry validation and core tests
- [x] 1.2 Move task, objective, plan and habit initialization and lifecycle transitions into their registered Profile contracts
- [x] 1.3 Update planning commands and tests to consume Profile-owned semantics with no parallel lifecycle map

## 2. Scheduled Automations

- [x] 2.1 Generalize Automation triggers behind registered payload contracts and add subject Item references
- [x] 2.2 Add explicit multi-occurrence schedule evaluation, cursor, deduplication and automatic stop behavior
- [x] 2.3 Cover schedule validation, lifecycle and evaluation behavior with core and module tests

## 3. Declarative interpretation

- [x] 3.1 Replace workflow drafts with operational Item, persisted State, Automation and Intent declarations using local references, dependencies and unresolved values
- [x] 3.2 Replace the strict inference schema, definition guidance, normalization and validation with the declaration plan contract
- [x] 3.3 Implement generic declaration publication, dependency ordering, reference resolution, idempotent outcomes and approval-safe behavior
- [x] 3.4 Convert interpretation and HTTP behavior tests from planning/reminder workflows to declarations, including applied, needsInput, unsupported and invalid cases

## 4. Remove the Reminder aggregate

- [x] 4.1 Remove Reminder domain, store, worker coupling and persistence from system composition
- [x] 4.2 Represent reminder creation as one scheduled notification Automation and derive reminder reads from Automations
- [x] 4.3 Route cancellation and rescheduling through Automation lifecycle and schedule while preserving compatibility HTTP behavior
- [x] 4.4 Update reminder, Automation, execution and runtime tests for unavailable, delivered, exhausted and stale-subject outcomes

## 5. Persistence and documentation

- [x] 5.1 Add an append-only migration that removes `automation_reminders` and generalizes interpretation outcomes for declaration kinds
- [x] 5.2 Update database, system, API and README documentation to describe declaration plans and derived reminders
- [x] 5.3 Remove obsolete workflow and Reminder files, exports, names and stale specification references

## 6. Verification

- [x] 6.1 Format all changed code and run typecheck, full tests and build
- [x] 6.2 Run strict OpenSpec validation and inspect the final diff for scope, evidence fidelity and accidental compatibility layers
