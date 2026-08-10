## 1. Suggestion Domain Vocabulary

- [x] 1.1 Rename the proactive domain file and `ProactiveProposal`, feedback, and urgency types to Suggestion vocabulary without aliases
- [x] 1.2 Rename the proactive store port, memory adapter, collections, parameters, return values, and errors to Suggestion vocabulary
- [x] 1.3 Update detector helpers, `ProactivityService`, fixtures, and JSDoc while preserving statuses, evidence, autonomy, consent, and Intent behavior

## 2. System Boundaries

- [x] 2.1 Update system composition and public proactivity types to use `SuggestionStore` and `MemorySuggestionStore` while retaining the Proactivity module name
- [x] 2.2 Change proactive inspector nodes and relationships to Suggestion vocabulary while leaving mutation Proposal nodes unchanged
- [x] 2.3 Rename `/proactive-proposals` resource and feedback routes to `/suggestions` without aliases while retaining `/proactive-evaluations`
- [x] 2.4 Update proactive-assistance documentation and all non-archived references without changing `ProposalRegistry`, approval endpoints, or mutation-mode vocabulary

## 3. Verification

- [x] 3.1 Update focused proactivity and inspector tests to assert Suggestion contracts and unchanged behavior
- [x] 3.2 Verify no proactive-proposal identifiers remain and technical Proposal identifiers still cover only mutation approval
- [x] 3.3 Run formatting, typecheck, deterministic tests, build, and strict OpenSpec validation
