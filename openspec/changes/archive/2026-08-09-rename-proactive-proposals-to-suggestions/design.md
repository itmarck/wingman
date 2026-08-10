## Context

The proactivity module currently calls its user-facing result `ProactiveProposal`, while the system mutation boundary uses a separate `Proposal` and `ProposalRegistry`. Both appear in the development inspector with related vocabulary even though only the latter represents an unapplied mutation.

## Goals / Non-Goals

**Goals:**

- Reserve Suggestion vocabulary for proactive assistance everywhere.
- Reserve Proposal vocabulary for mutation approval everywhere.
- Preserve all current proactive behavior and data fields.

**Non-Goals:**

- Rename the Proactivity module, service, detectors, or evaluation operation.
- Change Suggestion statuses, feedback behavior, autonomy, consent, Intent creation, or proactive evaluation routes.
- Add compatibility aliases or migrate production data.

## Decisions

### 1. Rename the complete proactive domain contract

`ProactiveProposal`, its source file, feedback and urgency types, store port, memory adapter, service return types, variables, errors, tests, and JSDoc will use `Suggestion`. `ProactivityService` remains named for the behavior it coordinates, while its store becomes `SuggestionStore` and its memory adapter becomes `MemorySuggestionStore`.

Partial aliases were rejected because the project has no production consumers and aliases would preserve the ambiguity.

### 2. Keep technical Proposal unchanged

`Proposal`, `ProposalRegistry`, mutation approval endpoints, and the `system.proposals` surface retain their names. They represent pending callbacks controlled by mutation mode, not assistance. This boundary is the reason for the rename.

### 3. Distinguish both concepts in the inspector

Proactive nodes use type `suggestion` and Suggestion labels. Pending mutation nodes remain type `proposal`. Edges from a Suggestion to its Intent continue to express the suggested action without changing graph behavior.

### 4. Apply before PostgreSQL storage

This change introduces no database migration because proactive data is still in memory. `implement-postgres-storage` follows it and creates only the final Suggestion table and adapter vocabulary, with no proactive-proposal compatibility layer.

### 5. Rename resource routes without aliases

`GET /proactive-proposals`, `GET /proactive-proposals/:id`, and `POST /proactive-proposals/:id/feedback` become their `/suggestions` equivalents. `/proactive-evaluations` remains because it names detector execution rather than a resource. No compatibility routes are retained.

## Risks / Trade-offs

- **[Broad mechanical rename can accidentally touch mutation Proposals]** → Restrict changes to proactivity and inspector proactive nodes, then assert that `ProposalRegistry` and approval tests remain unchanged.
- **[External TypeScript imports break]** → Accept the intentional breaking rename; there are no production consumers and no alias will be retained.

## Migration Plan

1. Rename proactive domain and storage symbols to Suggestion vocabulary.
2. Update the service, HTTP routes, inspector, tests, fixtures, and documentation.
3. Verify no proactive-proposal vocabulary remains and mutation Proposal behavior is unchanged.
4. Apply `implement-postgres-storage` afterward using the final Suggestion contract.
