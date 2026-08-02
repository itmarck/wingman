## Context

This additive change depends on archived State and execution capabilities. It creates deterministic reactivity without introducing a production side effect.

## Goals / Non-Goals

**Goals:** a closed Given/When/Then model, dependency-driven evaluation, temporal scheduling, and explainable Intent production.

**Non-Goals:** user-authored scripting, inference execution, task semantics, or production notification delivery.

## Decisions

Place stable Rule, trigger, policy, and condition-reference contracts under `src/core/rule/`. Add `src/modules/rule/` for registration, dependency indexing, due evaluation, and lifecycle operations. The module reads State and Events through ports and writes only Intents through the execution port.

When has one tagged form: time, Event, or State change. Given reuses the closed State AST plus event-field match operators. Then contains validated Intent templates only. Policy owns relative scheduling, repeat, expiration, cooldown, occurrence limit, stop conditions, priority, and deduplication.

Maintain `nextEvaluationAt` and dependency indexes in the memory adapter. The worker evaluates current Given conditions after When activates and records a Rule evaluation result even when no Intent is produced.

## Risks / Trade-offs

- [Rule syntax becomes arbitrary code] -> Tagged closed schemas only; no callbacks or provider expressions.
- [Workers scan all data] -> Claim due Rule IDs and changed dependency keys from indexed ports.
- [Repeated triggers duplicate Intents] -> Derive deduplication identity from Rule, occurrence, and triggering Event.

## Migration Plan

1. Add Rule contracts and validation.
2. Add memory registry and indexes.
3. Add evaluator and worker using State and execution ports.
4. Exercise time, Event, State-change, stop, and deduplication cases with a fake Capability.
5. Add read and control APIs and run verification.

Rollback removes the additive Rule module and worker; Items, State, and execution remain valid.

