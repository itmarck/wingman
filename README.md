# Wingman

Personal knowledge and automation server. Wingman preserves original Entries, derives structured
knowledge, resolves ambiguity through Reviews, and exposes Projections through an authenticated API.

## Setup

```bash
npm install
npm run migrate
npm run build
npm start
```

Configure the runtime in `.env`; every supported variable is documented in `.env.example`.
`INFERENCE_TARGET` is required and must be `openai.luna` or `groq.gptoss`. Only the API key for its resolved provider is required.

Generate a development access token:

```bash
# Replace browser with any device identifier
npm run --silent token -- browser
```

## Development

```bash
npm run typecheck
npm test
npm run build
```

The API lives under `/api` and uses Bearer authentication. Mutating requests accept `X-Mutation-Mode: readonly | approval | write`; the safe default is `readonly`. The current OpenAPI document is publicly available at `/api/openapi.json` for importing into API clients.

Knowledge storage is currently in memory. PostgreSQL stores migrations and inference telemetry.

Repository architecture and contribution guidance live in `AGENTS.md`.
