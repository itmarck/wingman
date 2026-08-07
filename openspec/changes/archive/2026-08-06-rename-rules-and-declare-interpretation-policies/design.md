## Context

Rule is a reactive Given/When/Then runtime, interpretation guidance is one prose array beside deterministic contracts, and reminder quiet hours assume an interruptive channel that the product does not provide.

## Goals / Non-Goals

**Goals:** complete one Automation vocabulary, expose passive launcher notifications, and generate provider guidance from an intentionally small code-owned Policy definition.

**Non-Goals:** persistent Policies, Entry-driven behavior mutation, a Policy DSL, interruptive channels, or broader planning redesign.

## Decisions

Rename the reactive aggregate and every public/internal reference to Automation without compatibility aliases. Its scheduling fields are `controls`, not Policies, and it still only produces Intents.

Use `InterpretationPolicy { key, guidance }` and one `InterpretationDefinition` containing operation metadata, enabled Policies, and output contract. The provider receives rendered guidance, while validation remains in existing schemas, registries, normalizers, and validators.

Remove quiet hours from reminder domain, HTTP, work, and tests. Occurrences control passive availability. Add an append-only migration for Automation and Policy telemetry vocabulary rather than editing historical migrations.

## Risks / Trade-offs

- [Mechanical rename misses a reference] -> Search all active sources and run the full verification suite.
- [Policy abstraction is initially shallow] -> Keep it deliberately small until concrete evolution justifies more structure.
- [Breaking HTTP and evaluation output] -> Document the replacement vocabulary and provide no dual-domain alias.
