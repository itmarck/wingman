# Wingman

Personal content, Collections/Records, Tasks and passive notifications. REFERENCE.md defines the proposal; implement only its active core stage. Keep complexity low for one maintainer. No universal entities, versions, jobs or extension frameworks unless an actual enabled capability needs them.

## Structure

- `src/core/`: model, validation and content/work/processing operations.
- `src/platform/`: PostgreSQL, JEV, authentication, HTTP and runtime adapters.
- `src/main.ts`: process entry point; `src/tsconfig.build.json`: app build config.
- `migrations/`: versioned, append-only changes after the replacement initial schema.
- `temp/`: never modify unless explicitly requested.

Use functions and small modules, not a class/file/interface per operation or table. Validate internal entry points as well as HTTP; preserve original text and falsy values. Source comes from authentication. Links have no action semantics. Do not duplicate
structural relationships as Links. No external request inside a database
transaction. Publish classification and effects together and fence tale claims.

Node >=22.18, TypeScript, ES modules, Fastify `/api`, PostgreSQL. Only the public development token route depends on NODE_ENV. Local execution uses Podman Compose in WSL. Railway uses default Railpack; npm start migrates before starting HTTP.

```bash
npx biome check --write <paths>
npm run typecheck
npm test
npm run build
podman compose up --build -d
podman compose down
```

Keep tests focused on pure rules and deterministic provider contracts. Database and HTTP integration tests are currently out of scope; reintroduce them only when requested. Keep provider fixtures distinct from real semantic evaluations. Exported helpers need concise JSDoc. Treat code as truth if docs differ.

For a requested smoke test, obtain a development token with source=codex, exercise the real principal API flow, inspect responses/logs/persisted effects, adapt on failure and evaluate semantic quality. Do not modify code unless requested. Report evidence, defects and limitations. Tests use isolated databases, not application data.
