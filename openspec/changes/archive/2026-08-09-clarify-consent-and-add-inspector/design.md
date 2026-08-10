## Context

Intent authorization currently names both a requirement field and a lifecycle action while mutation Proposals also use approval. Runtime information is already available through in-process operations and stores, but no combined development view exists.

## Goals / Non-Goals

**Goals:** make consent vocabulary unambiguous, prevent absent consent from elevating autonomy, and provide a zero-persistence development inspector.

**Non-Goals:** retain the previous HTTP or inference contract, add a production administration surface, add authentication to the inspector, or introduce a frontend framework.

## Decisions

1. Rename the Intent field to `consent: none | explicit`, the granted lifecycle state to `consented`, and the HTTP action to `/intents/:id/consent`. Keeping authorization aliases was rejected because the project has no production compatibility requirement.
2. Use `execute` as the global autonomy ceiling and let each Capability or user policy narrow it. Required explicit consent blocks execution until granted; granted consent may unlock `propose`, while `none` never elevates it and `blocked` and safety ceilings remain final.
3. Register `/inspect` and `/inspect/data` only when `NODE_ENV !== "production"`. They remain outside authenticated `/api` because they are absent rather than protected in production.
4. Build one generic snapshot from public System operations and stores. Nodes, edges and events avoid an inspector-specific domain model or persistence.
5. Keep static assets in `packages/inspector/`; the HTTP adapter locates them relative to its module so source and compiled execution behave alike.
6. Use semantic HTML, CSS variables and plain JavaScript. A framework or component dependency would add build complexity without value for a local diagnostic surface.
7. Limit notification Capability input to `message` and optional `priority`. The Automation worker already supplies proposer and trigger identity, and the notification view resolves its subject from the registered Automation; requiring the LLM to repeat those identifiers was rejected as fragile schema filler.

## Risks / Trade-offs

- [Development data is unauthenticated] → Bind normal development use locally and never register the routes in production.
- [The snapshot initially reflects only publicly reachable runtime state] → Prefer an honest partial graph over exposing internal adapter implementation.
- [Large graphs can become noisy] → Add type and text filters in the page while keeping the snapshot contract generic.

## Migration Plan

Replace all consent vocabulary atomically across domain, inference, HTTP, proactivity, fixtures and tests. No data migration or compatibility adapter is required.
