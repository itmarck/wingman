# Wingman

Personal knowledge and automation server. Wingman preserves original Entries, derives structured
knowledge, resolves ambiguity through Reviews, and exposes Projections through an authenticated API.

## Setup

```bash
npm install
copy .env.example .env
npm run migrate
npm run build
npm start
```

Configure the runtime in `.env`; every supported variable is documented in `.env.example`.
`INFERENCE_TARGET` is required and must be `openai.luna` or `groq.gptoss`. Only the API key for its
resolved provider is required.

Generate a development access token:

```bash
npm run --silent token -- browser
npm run --silent token -- minima
```

## Development

```bash
npx biome check --write src
npm run typecheck
npm test
npm run build
```

The API lives under `/api` and uses Bearer authentication. Mutating requests accept
`X-Mutation-Mode: readonly | approval | write`; the safe default is `readonly`.

Knowledge storage is currently in memory. PostgreSQL stores migrations and inference telemetry.
Repository architecture and contribution guidance live in `AGENTS.md`.
