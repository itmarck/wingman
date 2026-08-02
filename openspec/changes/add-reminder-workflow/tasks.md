## 1. Add notification execution

- [x] 1.1 Register the notification Capability and add its provider-independent port under `src/modules/reminder/`
- [x] 1.2 Add a test adapter covering delivered, failed, uncertain, and duplicate-safe outcomes under `src/adapters/notification/`
- [x] 1.3 Define notification safety ceiling, authorization, input, result, and idempotency contracts

## 2. Compose reminders

- [x] 2.1 Interpret explicit reminder Entries into referenced subjects or tasks, temporal constraints, Rule policies, and Intent templates
- [x] 2.2 Keep deadline or temporal range separate from cadence, quiet hours, expiration, occurrence limits, and stopping State
- [x] 2.3 Add reminder list, read, cancel, reschedule, and explanation operations and APIs

## 3. Verify end to end

- [x] 3.1 Test reminders before month end, repeated occurrences, stale completion, cancellation, quiet hours, and imprecise time
- [x] 3.2 Test unavailable Capability, delivery failure, uncertain result, retry, and duplicate prevention through Intent, Attempt, and Event
- [x] 3.3 Run the full Entry-to-delivery behavior test plus typecheck, full tests, build, and strict OpenSpec validation
