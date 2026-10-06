# Wingman

Personal text, structured lists and Tasks in PostgreSQL. The HTTP API receives Entry/Note captures durably; one Processor classifies them asynchronously with JEV. Collections define forms, Records hold explicit values, and Links associate selected objects. No entity hierarchy, universal history or generated text.

## Run locally

Development requires Node.js `>=22.18.0` and npm. Install the project dependencies with `npm ci`; run tests, typecheck and build on the host. Running Wingman locally requires WSL, Podman and a Compose provider. Copy `.env.example` to `.env`, set a private `SERVER_SECRET` and `TYPESAFE_API_KEY`, then:

```bash
podman compose up --build -d
podman compose logs -f app
```

The API is at `http://localhost:3300/api`. PostgreSQL 18.6 owns durable facts, processing leases, retries and inference telemetry. The selected JEV model is `jev-1.13.0`, declared in `src/platform/runtime.ts`; no alternate provider or automatic fallback is configured. Change that constant when intentionally upgrading it.

This is a replacement initial schema. **An earlier database is incompatible.** Use a fresh database/volume before starting this version. No automatic data conversion or reset occurs. `npm start` runs versioned migrations before HTTP. The implementation work has not reset the existing local database.

Railway uses default Railpack detection, `npm run build` and `npm start`. Set `DATABASE_URL`, `SERVER_SECRET`, `TYPESAFE_API_KEY` and Railway's `PORT`. Compose supplies its database address and sets development mode through the local Dockerfile. Only the token issuer depends on `NODE_ENV`.

## Launcher flow

Create a local token (this public endpoint exists only in development):

```bash
curl -sS -X POST 'http://localhost:3300/api/token?source=codex'
```

All application routes require `Authorization: Bearer <token>`. The token supplies the capture source; bodies cannot override it. Health, readiness and OpenAPI are public: `GET /api/health`, `/api/ready`, `/api/openapi`.

| Method | Route | Input / result |
| --- | --- | --- |
| POST | `/api/content/capture` | `text`, `inputMode: Entry\|Note`, `submissionKey`, optional `preset`, `plannedFor`, `dueAt` → `{id, accepted:true}` |
| GET | `/api/catalog` | Areas, presets, field types and current settings |
| POST | `/api/settings` | `{timezone, taskCapture}` |
| GET | `/api/collections` | Optional `id`, `offset`; one definition + Records/references, or definitions |
| POST | `/api/collections` | `{id?, name, area, definitions?, fields}` |
| POST | `/api/content/records` | `{id?, collectionId, title, ...properties, values?, references?}` |
| GET | `/api/references/search` | `text`, optional `collectionId` → title/type/ID only |
| GET | `/api/references` | `id` → incoming/outgoing links and endpoint titles |
| POST | `/api/references` | `{fromId,toId,fieldId?,context?}` |
| POST | `/api/references/remove` | Exact `{fromId,toId,fieldId?}` |
| GET | `/api/work/day` | `from`, optional `to`, `timezone`; dates are `YYYY-MM-DD` |
| POST | `/api/work/complete` | `{id,finished}` completes/reopens one Task |
| GET | `/api/notifications` | Unresolved, unacknowledged and currently visible notices |
| POST | `/api/notifications/respond` | `{id,action: acknowledge\|defer,until?}`; ID is subjectId |

Capture defaults to `organize`: classify and retain original text without creating actions. `taskCapture` must first be enabled with settings; it requires an explicit `plannedFor` date so the resulting Task appears in the launcher. It can create only one simple action with a determined area. The whole source text becomes its title. `dueAt` is separate and never inferred; dates embedded in prose are not extracted. Notes always use organize and never extract Tasks. URLs are text, not downloads.

```json
{"text":"Comprar pan","inputMode":"Entry","submissionKey":"launcher-001","preset":"taskCapture","plannedFor":"2026-10-05"}
```

Reusing a submissionKey with identical input returns the original receipt; changed input returns 409. Equal text with a different key is a different capture. Clients refresh the day and notifications after receipt; processing results are not REST. Task creation and classification commit together. A unique sourceId prevents repeat effects; leases allow recovery after restart and fence stale workers. Technical
failures use persistent exponential backoff (2–1024 seconds), remain pending, and produce one passive notice after three failures. Unsupported/uncertain task captures are retained with one notice. Successful captures do not produce routine notices.

Notifications for overdue Tasks are maintained by the Processor and completion operation. Reading never acknowledges them; acknowledgment never completes a Task. Date-only dueAt is overdue after that local day, using the preference timezone. Day queries filter plannedFor first; an unplanned Task can appear by dueAt in the selected timezone. Internal unscheduled Tasks without either date are not a day view.

Records inherit the Collection area. Shared optional properties are subtitle, body, category, percentage (0–100), occurredAt, dueAt and url. Date values can be date-only or an ISO timestamp with explicit offset. Unknown dates stay absent. Additional fields have stable UUIDs and types text, number, boolean, date, select or reference. Select requires options; select/reference optionally allow multiple values.
Reference may restrict targets with collectionId. Additional values are keyed by field UUID; references use `{fieldId: [targetId]}` and are stored only in links.

Record saves patch supplied optional properties/values; null clears a value, while zero, false and empty text remain values. A supplied reference array replaces that field; an empty array clears it. Renaming a field preserves its ID. Incompatible changes with existing data are rejected. Internal removeField explicitly hides or deletes definitions and their data together. Collections may have no extra fields.

Collection lists/Records use pages of 100 with offset. Reference candidates are bounded to 30, day results to 500 and visible notices to 100. Limits are intentional for this initial personal workflow. General content browsing, arbitrary work writes, archive/edit/retry operations stay internal functions, not launcher endpoints.

## Code and verification

`src/core/` groups the data model and content/work/processing operations. `src/platform/` groups PostgreSQL, JEV, authentication, HTTP and runtime adapters. `src/main.ts` remains the process entry point; `src/tsconfig.build.json` configures the app build. This keeps the source in two functional groups without creating a directory per file. Types/schemas are shared at module and HTTP boundaries. SQL stays with the operations that need it. No transaction spans JEV requests.

```bash
npm ci
npm run typecheck
npm test
npm run build
```

These commands use Node and npm on the host. Compose runs PostgreSQL and the
application; it does not provide a test runner.

`npm test` runs the fast tests in `src/core/tests/core.test.ts`: pure validation, JWT signing and the JEV HTTP contract with a mocked `fetch`. They do not start PostgreSQL, exercise the Fastify routes or measure JEV's semantic quality. The JEV adapter follows the [official HTTP contract](https://docs.typesafe.ai/api). **Real Spanish semantic quality has not been measured**; taskCapture is disabled initially for that reason. Confidence below 0.8 yields undetermined; this threshold is provisional, not a guarantee.

`REFERENCE.md` contains the full proposal; `MIGRATION.md` records this migration. Projects, Calendar, connectors, recurrence, embeddings, general search, Windows, exchange, streams and a UI are future stages, with no implementation placeholders.
