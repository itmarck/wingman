## Why

Calling proactive assistance a proposal confuses user-facing suggestions with the separate technical Proposal used by development mutation approval. `Suggestion` expresses the real meaning and preserves `Proposal` for pending mutations only.

## What Changes

- **BREAKING** Rename the proactive domain contract from `ProactiveProposal` to `Suggestion`, including feedback and urgency types, store names, service results, inspector nodes, tests, and documentation.
- **BREAKING** Replace proactive Suggestion routes under `/proactive-proposals` with `/suggestions`; retain `/proactive-evaluations` for detector execution.
- Use suggestion vocabulary throughout proactive assistance while keeping its detector, evidence, autonomy, consent, status, and Intent behavior unchanged.
- Keep `Proposal`, `ProposalRegistry`, approval endpoints, and mutation-mode behavior unchanged because they represent unapplied technical mutations.
- Make the PostgreSQL storage change persist Suggestions under the final vocabulary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `proactive-assistance`: Rename proactive proposals and their feedback contract to Suggestions without changing behavior.

## Impact

- Affects `src/modules/proactivity`, system composition names, the development inspector, tests, and proactive-assistance documentation.
- Changes only the authenticated proactive Suggestion routes; mutation approval Proposals, Capability autonomy, Intent consent, and stored production data remain unchanged.
- Must be applied before `implement-postgres-storage` so the new schema and adapter use `Suggestion` directly.
