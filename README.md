# Wingman

Personal knowledge and automation server. Wingman preserves original Entries, derives composable Items and declarative operations, resolves uncertain Item references through Reviews, and exposes planning, notification views, Suggestions and Projections through an authenticated API.

## Setup

```bash
npm install
npm run migrate
npm run build
npm start
```

Configure the runtime in `.env`; every supported variable is documented in `.env.example`.
`INFERENCE_TARGET` selects the inference adapter and model. The domain remains provider-agnostic and requires only the API key resolved by that target.

Generate a development access token:

```bash
# Replace browser with any device identifier
npm run --silent token -- browser
```

## Development

```bash
npm run typecheck
npm test
npm run test:postgres
npm run test:http
npm run test:all
npm run build
```

`npm test` runs fast deterministic tests without PostgreSQL or an inference provider. `test:postgres` and `test:http` each start a harness-owned native PostgreSQL 18.4 cluster, apply the real migrations, ignore `DATABASE_URL`, and remove their temporary data on completion. `test:all` runs every deterministic gate. `npm run evaluate` remains the explicit semantic evaluation against the configured real inference target.

The API lives under `/api` and uses Bearer authentication. Mutating requests accept `X-Mutation-Mode: readonly | approval | write`; omitting the header means `readonly`. `MUTATION_MODE=approval` is the initial system policy for development and production; production may move to `write` after validation. The current OpenAPI document is publicly available at `/api/openapi.json`.

The built-in projections are `system.currentItems` and `system.glossary`. Together they expose current Item compositions and their human-readable catalog.

PostgreSQL is required for every complete runtime and stores all durable domain facts plus inference telemetry. There is no selectable memory backend or automatic fallback. Pending Proposal callbacks remain intentionally process-local and are discarded on restart.

## Concepts

### Reference resolution

Every Review uses the generic `referenceResolution` contract. A Review asks which Item a Draft reference denotes and offers the proposed Item plus zero or more existing candidates. This covers names, pronouns, authorship and other uncertain references without case-specific Review types.

Read pending Reviews through `/api/reviews` and `/api/reviews/:id`. Resolve one with
`POST /api/reviews/:id/resolution`; provide `selectedItemId` to select an existing candidate or omit it to confirm the proposed Item. Knowledge remains unpublished until every Review for the Interpretation is resolved. In `approval` mode the resolution request returns a Proposal; approving that Proposal applies the decision and resumes publication without blocking the original request.

### Knowledge language

Wingman preserves every Entry exactly as received, including its original language. Spanish is the canonical language for newly derived human-readable knowledge such as Item names, aliases, descriptions, Reviews, and invalid reasons.

Internal registry keys remain stable English `camelCase`. Proper names, acronyms, quotations, and technical terms may remain in their original language when translation would lose meaning or useful context. An important original-language term may also be retained as an alias. Multilingual search and localized representations are not currently part of the system contract.

Verbatim citations use the `quote` Literal and must match the original text exactly. Plain text Entries support paragraph locators; URL Entries do not expose verifiable source locations yet.

### Passive notifications

Wingman notifications are passive launcher items. They become visible in the launcher and the user sees them when opening the mobile application; they do not produce push alerts, banners, sounds, vibration, foreground UI, or another interruption.

`GET /api/notifications` exposes a compact active view derived from notification Intents and Events. `POST /api/notifications/:id/acknowledgement` removes a notice from that view without completing its subject. Notifications have no entity or table.

Current product scope is tasks, objectives, plans, habits and notifications. New domains are added only when repeated use justifies their contracts.

### Deployment

Wingman runs as one long-lived Railway service. HTTP, interpretation, scheduling and execution remain in the same process while that stays operationally viable.

`railway.json` builds one process, runs `npm run migrate` as a pre-deploy command, starts the application, and gates deployment on `/api/ready`. `/api/health` is liveness-only. Configure a Railway PostgreSQL 18.4 service, `DATABASE_URL`, `POSTGRES_POOL_MAX` (default `5`), `SERVER_SECRET`, one registered `INFERENCE_TARGET` with its API key, and `MUTATION_MODE` (`approval` initially; `write` when ready). Locally, `npm run build && npm start` exercises the same artifact.

The current `001_system.sql` and `002_telemetry.sql` files are a fresh baseline. Before the first deployment of this version, recreate the intentionally empty database so it has neither legacy tables nor a prior `pgmigrations` history; after that reset, migrations are append-only from `003` onward.

---

Repository architecture and contribution guidance live in `AGENTS.md`.
