## 1. Quality model and reporting

- [x] 1.1 Add generic check, axis, threshold, critical-invariant, gate-decision, and evidence types to `packages/evaluate`
- [x] 1.2 Add stable human and JSON reports with `pass`, `fail`, and `notRun` outcomes and highest-impact failures
- [x] 1.3 Add CLI lane, case-filter, repeat, and output options with a remote-free local default

## 2. Deterministic local axes

- [x] 2.1 Add an isolated loopback HTTP harness using fresh memory state, deterministic inference, authentication, and guaranteed cleanup
- [x] 2.2 Measure semantic quality for knowledge, exact quotes, planning profiles, habits, objectives, reminders, mixed requests, and unsupported events
- [x] 2.3 Measure observability for applied, incomplete, unsupported, failed, retried, and exhausted processing outcomes through public status evidence
- [x] 2.4 Measure HTTP contracts for OpenAPI, authentication, mutation mode, malformed payloads, unknown resources, and safe structured errors
- [x] 2.5 Measure critical security invariants for untrusted origin, destructive text, closed inference output, and absence of executable or external effects
- [x] 2.6 Measure simplicity through inward dependency, import-cycle, production file-size, and generic-runner coupling checks
- [x] 2.7 Measure evolution by registering and scoring a new scenario through the public evaluator surface without core runner changes

## 3. Real-model quality

- [ ] 3.1 Preserve and extend exact deterministic expectations for quotes, Reviews, planning, reminders, unsupported events, and destructive requests
- [ ] 3.2 Report model identity, attempts, structured-output failures, tokens, duration, pass rate, and cross-repetition instability
- [ ] 3.3 Ensure the real lane is explicit, bounded by filters/repetitions, memory-only, and never persists telemetry or effects

## 4. Iteration and correction

- [x] 4.1 Run the first local quality baseline and commit the evaluator once all seven axes have evidence
- [ ] 4.2 Prioritize and fix local metric failures without lowering thresholds, then repeat build, tests, API smoke, and quality twice from clean processes
- [ ] 4.3 Run the bounded real-model baseline, fix the highest-impact prompt, schema, parsing, or product defects, and repeat until its exit threshold is met or a documented external blocker remains
- [ ] 4.4 Remove evaluator duplication and any production classes, functions, or files proven unnecessary during the iterations
- [ ] 4.5 Run formatting, typecheck, full tests, build, smoke, strict OpenSpec validation, and verify a clean worktree after conventional commits
