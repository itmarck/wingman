## Context

The schema accepts only `none | explicit`, but request context also exposes Capability autonomy such as `execute`. Gemini copied that value into Intent authorization. After that ambiguity was removed, evaluation showed registered descriptions and `unknown` Automation fields do not expose enough shape information for valid publication. It also exposed contradictory deadline guidance: derive the end-of-month boundary, but accept only an explicitly stated occurrence.

## Goals / Non-Goals

**Goals:** remove semantic ambiguity and make existing registered contracts usable by inference while preserving strict, provider-neutral validation.

**Non-Goals:** coerce invalid output, change autonomy resolution, or specialize behavior for Gemini.

## Decisions

1. Add one interpretation Policy defining authorization as consent, separate from autonomy. Prompt guidance is appropriate because the model must choose the semantic value.
2. Add the same concise distinction as the JSON Schema property description. Structured-output providers receive it adjacent to the constrained field.
3. Keep the enum and parser unchanged. Mapping `execute` to `none` was rejected because a parser must not silently grant authority.
4. Extend deterministic schema tests and run the existing real-model notification case with one attempt first; retries must not hide a systematic contract error.
5. Keep the existing Component description contract and make each planning description state its exact value shape. A second schema representation was rejected because it could drift from validators and add architecture without immediate value.
6. Tell inference not to declare Profile lifecycle or initial Components. Publication remains the single owner of those defaults.
7. The deterministic quality probe advances through all three scheduled attempts instead of treating a sub-millisecond availability gap as an empty queue.
8. Encode the closed Automation trigger and Intent-template envelopes in the structured-output schema. Their dynamic Condition and Capability input values remain registry-defined.
9. Describe Trigger values and notification input beside their registered validators so interpretation remains provider-agnostic and extensible.
10. When a reminder gives a deadline but no separate occurrence, reuse the Policy-derived deadline boundary once. This creates the minimum notification count without inventing another threshold.

## Risks / Trade-offs

- [A deadline notification occurs at the boundary rather than earlier] → Keep one deterministic occurrence now; later notification prioritization may move it without changing stored entities.

- [Provider still ignores the description] → Keep the failure visible and use real-model evidence before considering a target-specific incompatibility.
- [More prompt text increases noise] → Add only the two authorization meanings and the explicit non-autonomy distinction.
- [Descriptions can drift from validators] → Cover planning descriptions with deterministic contract tests and keep them adjacent to their validators.
