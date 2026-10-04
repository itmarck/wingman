# Wingman

Wingman is a provider-agnostic task, knowledge and automation server. It preserves original Entries, derives structured Items, resolves uncertain references with Reviews, and exposes an authenticated API.

## Local Podman

In WSL, install a Compose provider once if needed (`sudo apt install podman-compose`). Create `.env` from the example and replace the local secret and inference API key:

```bash
cp -n .env.example .env
podman compose up --build -d
podman compose logs -f app
```

The API is at `http://localhost:3000/api`; OpenAPI is at `/api/openapi`. The local image sets `NODE_ENV=development`, enabling the public token endpoint. The endpoint is absent in production and whenever `NODE_ENV` is not `development`. Create a token with:

```bash
curl -sS -X POST 'http://localhost:3000/api/token?source=browser'
```

After changing application code or dependencies, rebuild only the app; the database and its volume stay running:

```bash
podman compose up --build -d app
```

Run the full suite, including PostgreSQL and HTTP integration tests:

```bash
podman compose --profile tests run --build --rm tests
```

Tests reuse the local PostgreSQL service and create/drop a separate database per test project. Quick checks use the same runner:

```bash
podman compose --profile tests run --build --rm tests npm test
podman compose --profile tests run --build --rm tests npm run typecheck
```

Stop the services with `podman compose down`. Remove the local database too only when you want a clean reset: `podman compose down --volumes`.

## Configuration and deployment

Locally, `.env` needs `SERVER_SECRET`, `INFERENCE_TARGET`, and the matching `INFERENCE_API_KEY_*`. Compose provides PostgreSQL 18.6 and the local port. The example separates these local values from Railway settings.

Railway uses its default Railpack detection; it runs the package build and starts the app with `npm start`. That script applies database migrations before launching the server, so no `railway.json` is required. Railway provides `DATABASE_URL` from its linked PostgreSQL service and `PORT`; set `SERVER_SECRET`, `INFERENCE_TARGET`, and the matching provider API key in Railway Variables. Each environment should have its own `SERVER_SECRET`; tokens are only valid in the environment whose secret signed them. The local-only root Dockerfile is used by Compose.

All API routes except health, readiness, OpenAPI, and the development token endpoint require a Bearer token. Authenticated writes apply directly; uncertain Item references still wait for a Review decision before publication.
