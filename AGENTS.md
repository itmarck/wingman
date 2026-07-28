# AGENTS.md

Wingman is a provider-agnostic personal knowledge and automation server. It preserves immutable
Entries, derives Concepts, Predicates, Axioms and Links, resolves ambiguity through Reviews, and
exposes Projections through an authenticated HTTP API.

## Architecture

- `src/core/`: stable knowledge entities and invariants; no infrastructure dependencies.
- `src/modules/`: feature slices with operations, ports, adapters and behavior tests.
- `src/system/`: composition and cross-module policies.
- `src/adapters/`: HTTP, PostgreSQL, inference and runtime infrastructure.
- `src/runtime.ts`: starts and closes the complete process; `main.ts` only composes and handles signals.
- `migrations/`: append-only PostgreSQL migrations managed by `node-pg-migrate`.
- `temp/`: experiments; never modify unless explicitly requested.

Dependencies point inward toward stable concepts. Keep framework and driver types behind adapter
surfaces. Knowledge storage is still in memory; PostgreSQL currently stores inference telemetry.
Inference uses one required infrastructure target that resolves to an adapter and model, with
`low | high` reasoning and no automatic fallback.

## Commands

```bash
npx biome check --write <paths>
npm run typecheck
npm test
npm run build
npm run migrate
npm start
npm run --silent token -- browser
```

## Conventions

- Node.js `>=22.18.0`, TypeScript, ES modules, Fastify under `/api`.
- Prefer simple readable code, `async/await`, `const`, and `this`.
- Avoid unnecessary layers, abbreviations, one-use return variables and long compound conditions.
- Apply validation, normalization, cloning and freezing consistently.
- Add concise JSDoc to exported classes and meaningful standalone helpers.
- Tests cover relevant behavior per operation, not every internal function.
- Never hardcode secrets or trust a Connector source supplied in an HTTP body.
- Treat code as the source of truth when documentation disagrees.
