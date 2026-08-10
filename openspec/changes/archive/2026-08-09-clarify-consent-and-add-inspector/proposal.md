## Why

Intent consent is currently named authorization and can be confused with Capability autonomy or mutation approval. The growing in-memory runtime also needs a compact development view for understanding data and process relationships.

## What Changes

- **BREAKING** Replace Intent `authorization: none | explicit` with `consent: none | explicit`, including its HTTP consent operation and lifecycle vocabulary.
- Ensure absent consent never increases configured autonomy; explicit granted consent may unlock a proposed effect without exceeding its safety ceiling.
- Add a development-only inspector with a generic nodes, edges and events snapshot.
- Add a framework-free HTML interface under `packages/inspector/` using the default shadcn black theme.
- Do not register or serve inspector routes when `NODE_ENV=production`.
- Keep notification input semantic and derive runtime identity from its Automation and Intent.

## Capabilities

### New Capabilities

- `development-inspector`: Development-only visualization of runtime knowledge and operational flows.

### Modified Capabilities

- `intent-execution`: Separate Intent consent from autonomy and remove authorization vocabulary from the Intent contract.
- `interpretation-policy`: Emit the renamed consent field without treating it as autonomy.
- `proactive-assistance`: Record and grant explicit consent for proactive Intents.
- `quality-gates`: Evaluate the renamed consent contract instead of authorization vocabulary.
- `launcher-notifications`: Derive notification identity from runtime causation instead of LLM-authored input fields.

## Impact

Intent domain and HTTP contracts, inference schema and Policies, execution policy, tests, HTTP composition, and new inspector assets change. No persistent entity or production route is added.
