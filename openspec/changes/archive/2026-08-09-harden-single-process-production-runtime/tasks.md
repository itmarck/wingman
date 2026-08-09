## 1. Classified Inference Failures

- [x] 1.1 Add provider-neutral transient, quota and invalid-response retry classifications
- [x] 1.2 Configure two increasing delays per retry class and enforce three total attempts
- [x] 1.3 Map HTTP, network, quota and invalid output failures while keeping configuration errors terminal

## 2. Production Lifecycle

- [x] 2.1 Verify and test coordinated single-process startup and shutdown ownership
- [x] 2.2 Add Railway build, start, health and failure-restart configuration
- [x] 2.3 Document inference target, mutation policy and local production operation concisely

## 3. Verification

- [x] 3.1 Add deterministic tests for classified delays, provider timing, exhaustion and terminal failures
- [x] 3.2 Exercise the launcher production smoke flow and inspect API effects and logs
- [x] 3.3 Run formatting, typecheck, deterministic tests and build
