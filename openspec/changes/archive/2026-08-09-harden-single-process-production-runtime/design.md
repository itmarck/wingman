## Context

Runtime already composes HTTP and one polling worker in one process. Interpretation retries currently treat only availability failures as retryable and use one delay sequence, which loses quota and invalid-output semantics.

## Goals / Non-Goals

**Goals:** make the existing process operationally explicit, classify inference failures, and provide bounded deterministic retry and shutdown evidence.

**Non-Goals:** split services, add queues, add provider fallback, or introduce provider concepts into core modules.

## Decisions

1. Keep Runtime as the sole lifecycle owner. The polling command continues interpretation, scheduling and execution sequentially inside the same process; Railway runs one start command.
2. Retryable inference errors carry a provider-neutral retry class (`transient`, `quota`, or `invalidResponse`) and optional earliest retry delay. Authentication, configuration and unsupported-target errors remain terminal.
3. Processing configuration contains two increasing delays per retry class, yielding three total attempts. Provider quota timing is a lower bound; it cannot be shortened by local defaults.
4. HTTP status 429 maps to quota; timeouts, network failures, conflicts and 5xx map to transient; schema/semantic decode failures map to invalid response. Telemetry preserves the existing public error category.
5. `INFERENCE_TARGET` continues resolving exactly one registered adapter. Mutation authority remains the minimum of configured system policy and request policy.
6. Railway metadata uses the existing health route and npm build/start commands. Restart applies only to process failure; application retries remain bounded independently.

## Risks / Trade-offs

- [Long outage delays slow recovery] → Use increasing but bounded defaults and respect explicit provider timing.
- [In-memory work is lost on restart] → Accept for the current no-production-data phase; persistent knowledge storage is a separate change.
- [One slow phase delays others] → Keep bounded operation timeouts and measure before adding concurrency or services.

## Migration Plan

Change error classification and tests first, then add deployment metadata and lifecycle smoke coverage. Rollback restores the previous retry configuration without data migration.
