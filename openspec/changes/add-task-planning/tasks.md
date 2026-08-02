## 1. Register planning compositions

- [ ] 1.1 Add immutable `task`, `objective`, `plan`, and `habit` Profiles and shared descriptive, lifecycle, temporal, assignment, planning, and progress Components
- [ ] 1.2 Define and test Profile-specific lifecycle transitions and append-only transition history
- [ ] 1.3 Validate typed objective, plan, responsible Item, and dependency references and reject dependency cycles

## 2. Add planning operations

- [ ] 2.1 Add `src/modules/planning/` create, transition, schedule, assign, relate, measure, and query operations over the canonical knowledge store
- [ ] 2.2 Preserve unscheduled tasks without invented dates and represent desired objectives through State
- [ ] 2.3 Add pending, blocked, overdue, unscheduled, actionable, completed, and progress projections and APIs

## 3. Verify

- [ ] 3.1 Cover calling to schedule an appointment, learning objectives, plans, habits, blockers, reopening, and progress in behavior tests
- [ ] 3.2 Verify planning operations create no notification, Rule, or external effect implicitly
- [ ] 3.3 Run typecheck, full tests, build, and strict OpenSpec validation

