# Wingman

Personal log with its own database. Entries (`note`, `task`, `project`) are the log; Collections hold Records without behavior; links associate any two items. A background Processor classifies each Entry with JEV closed questions; views are deterministic. Files live elsewhere: only URLs are stored. The system definition is [docs/SYSTEM.md](docs/SYSTEM.md).

## Run locally

Development requires Node.js `>=22.18.0` and npm (`npm ci`). Running Wingman locally uses WSL, Podman and a Compose provider. Copy `.env.example` to `.env`, set a private `SERVER_SECRET` and `TYPESAFE_API_KEY`, then:

```bash
npm run container:start
```

`npm run container:restart` rebuilds after code changes and `npm run container:stop` stops everything. Logs: `podman compose logs -f app`. As in production, one server serves the administrative panel at `http://localhost:3300/` and the API at `http://localhost:3300/api`.

The schema is a replacement initial migration: **an earlier database is incompatible** and needs a fresh volume (`podman compose down -v`). `npm start` runs migrations before HTTP. The JEV model is `jev-1.13.0`, declared in `src/platform/runtime.ts`.

Railway uses default Railpack detection, `npm run build` and `npm start`, with `DATABASE_URL`, `SERVER_SECRET`, `TYPESAFE_API_KEY` and `PORT`. The database needs the `unaccent` and `pg_trgm` extensions (created by the migration).

## Backup

```bash
pg_dump "$DATABASE_PUBLIC_URL" -Fc -f wingman.dump
```

Restore into an empty database with `pg_restore -d "$DATABASE_URL" wingman.dump`.

## API

Get a local token (only in development): `curl -sS -X POST 'http://localhost:3300/api/token?source=codex'`. Every other route requires `Authorization: Bearer <token>`; the token supplies the capture source. The panel uses the same token. Health, readiness and OpenAPI are public: `/api/health`, `/api/ready`, `/api/openapi`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET/POST | `/api/entries` | List by `kind`, `area`, `parentId`, `open`; capture `{kind: note\|task, text, submissionKey, occurredAt?, plannedFor?, dueAt?}` |
| GET/PATCH | `/api/entries/{id}` | Detail with latest classification; edit or correct (`editedText`, `area`, `parentId`, dates, task attributes) |
| GET/POST | `/api/entries/{id}/links` | Links of any item (incoming and outgoing); create `{toId, note?}` |
| DELETE | `/api/entries/{id}/links/{otherId}` | Remove a link |
| GET | `/api/tasks?view=now\|all&context&minutes&limit` | Short prioritized list, or every open task |
| POST | `/api/tasks/{id}/finish\|reopen\|postpone\|skip` | Facts about a task; postpone accepts `{until?}` |
| GET | `/api/journal?from&to` | Notes, finished tasks and dated Records grouped by local day |
| GET | `/api/search?q=` | Entries, Collections and Records by text |
| GET | `/api/notifications` | Passive notices derived on read |
| GET | `/api/collections` | Collections with Record counts |
| GET/POST | `/api/collections/{id}/records` | Records of one Collection; create one |

The panel's internal routes live under `/api/admin` (flow, retry, projects, collections, records, preferences, settings and archive).

Captures answer immediately; the same `submissionKey` with the same input returns the same receipt, and different input returns 409. Instants are stored in UTC and always returned as ISO strings ending in `Z`; clients convert them to local time. `plannedFor` is a calendar day (`YYYY-MM-DD`). The `timezone` setting is the user's zone; it gives local-day meaning to Spanish dates in the text (`mañana`, `antes del viernes`, `ayer`) that fill `plannedFor`, `dueAt` or `occurredAt`, to date-only inputs (start of that local day), today's tasks, postponing and journal days. The server's own timezone (`TZ`) is irrelevant.

## Code and verification

`src/core/` holds the model and operations (entries, collections, links, questions, tasks, dates, processing). `src/platform/` holds PostgreSQL, JEV, authentication, HTTP and runtime adapters. `src/panel/` is the React + Radix UI panel built by Vite into `dist/panel`.

```bash
npm run typecheck
npm test
npm run build
```

`npm test` covers pure rules (validation, dates, task ranking, notices, question thresholds) and the JEV HTTP contract with a mocked `fetch`. It does not start PostgreSQL or measure JEV's semantic quality; thresholds are provisional.
