## 1. Quality model and reporting

- [x] 1.1 Add generic checks, axes, thresholds, critical invariants, evidence, and gate decisions
- [x] 1.2 Produce stable human and JSON reports for all seven axes
- [x] 1.3 Report model identity, attempts, failures, tokens, duration, and instability

## 2. Evaluation boundaries

- [x] 2.1 Keep `npm test` deterministic and independent from inference configuration
- [x] 2.2 Make `npm run evaluate` the single explicit token-consuming evaluation command
- [x] 2.3 Run every semantic case with fresh memory state, ephemeral telemetry, filters, attempts, and timeouts
- [x] 2.4 Propagate provider, quota, timeout, schema, and semantic failures through a nonzero exit

## 3. Quality evidence

- [x] 3.1 Measure semantic outcomes for quotations, Reviews, planning, reminders, unsupported events, and destructive requests
- [x] 3.2 Measure observability, HTTP contracts, security, simplicity, and evolution through focused checks
- [x] 3.3 Keep scoring generic so new cases do not require formatter or per-axis runner branches

## 4. Simplification and verification

- [x] 4.1 Remove obsolete `quality`, `quality:real`, and scripted smoke commands
- [x] 4.2 Remove deterministic smoke fixtures and duplicated evaluator output code
- [x] 4.3 Verify formatting, typecheck, deterministic tests, build, and a bounded real-model evaluation
