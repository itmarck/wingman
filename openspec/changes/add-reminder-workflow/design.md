## Context

This change depends on archived Item, State, execution, Rule, and planning capabilities. It is the first production-shaped vertical workflow but begins with a test notification adapter.

## Goals / Non-Goals

**Goals:** interpret, schedule, stop, deliver, retry, and explain reminders end to end.

**Non-Goals:** email/calendar connectors, arbitrary actions, or general proactive planning.

## Decisions

Add `src/modules/reminder/` as an orchestration slice. It registers a reminder interpretation contract and composes existing task, temporal, Rule, Intent, and State operations. Notification execution is a registered `notification` Capability with a port; provider adapters live under `src/adapters/notification/`.

A reminder request does not create a separate knowledge ontology. It references an existing subject or task, stores deadline or temporal range in the temporal Component, and stores cadence in Rule policy. Default cadence is selected from explicit user preference; otherwise ambiguity requests Review or uses an explicitly documented safe default.

Every occurrence rechecks stop State before Intent creation and again before Attempt. Delivery Events establish delivered State; failed or uncertain Attempts follow Capability idempotency.

## Risks / Trade-offs

- [Reminder fatigue] -> Enforce quiet hours, occurrence limits, cancellation, and preference-controlled defaults.
- [Imprecise time becomes fabricated precision] -> Preserve the source constraint and make cadence a separate policy.
- [Delivery retry duplicates notifications] -> Use occurrence and Intent idempotency identities.

## Migration Plan

1. Add notification Capability contract and test adapter.
2. Add reminder interpretation and composition operation.
3. Add reminder views and control APIs.
4. Run end-to-end stale, repeated, failed, uncertain, retried, and cancelled scenarios.
5. Add a production adapter only in a separately reviewed follow-up if needed.

Rollback disables the reminder worker and Capability registration; tasks and Rules remain inspectable.

