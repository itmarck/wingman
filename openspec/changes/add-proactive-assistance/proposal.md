## Why

Wingman's central goal is to use stored knowledge and planning State proactively, not merely wait for explicit reminder commands. Proactivity must remain explainable and constrained by capability-specific autonomy.

## What Changes

- Add deterministic detectors for missing next actions, blockers, approaching deadlines, inactivity, conflicts, and relevant new knowledge or Events.
- Produce explainable Rules or Intents containing evidence, relevant State, rationale, urgency, and expiration.
- Resolve autonomy from global default through Capability policy, user preference, explicit authorization, and Capability safety ceiling.
- Add feedback from accepted, rejected, postponed, and completed proposals without allowing inference to mutate or execute directly.

## Capabilities

### New Capabilities

- `proactive-assistance`: Detect actionable risks and opportunities and propose timely, explainable, autonomy-controlled Intents.

### Modified Capabilities

None.

## Impact

- Requires the archived reminder workflow and its underlying knowledge, State, Intent, Rule, and planning capabilities.
- Adds detectors, proposal projections, feedback records, autonomy resolution, APIs, and semantic-quality tests.
