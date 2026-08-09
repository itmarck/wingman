# Wingman

Personal knowledge and automation server. Wingman preserves original Entries, derives composable Items and declarative operations, resolves uncertain Item references through Reviews, and exposes planning, notification views, proactive proposals and Projections through an authenticated API.

## Setup

```bash
npm install
npm run migrate
npm run build
npm start
```

Configure the runtime in `.env`; every supported variable is documented in `.env.example`.
`INFERENCE_TARGET` is required and must be `gemini.flash`, `groq.gptoss`, or `openai.luna`. Only the API key for its resolved provider is required. Use `gemini.flash` with `INFERENCE_API_KEY_GEMINI` for local development and tests; keep `groq.gptoss` with `INFERENCE_API_KEY_GROQ` in the production environment.

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

`npm test` runs deterministic tests without calling an inference provider. `npm run evaluate` runs the semantic cases against the configured real inference target; authentication, quota, availability, or semantic failures make that command exit nonzero.

The API lives under `/api` and uses Bearer authentication. Mutating requests accept `X-Mutation-Mode: readonly | approval | write`; the safe default is `readonly`. The current OpenAPI document is publicly available at `/api/openapi.json` for importing into API clients.

The built-in projections are `system.currentItems` and `system.glossary`. Together they expose current Item compositions and their human-readable catalog.

Knowledge storage is currently in memory. PostgreSQL stores migrations and inference telemetry.

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

A reminder is not a stored entity. It is a derived view of one notification Automation with a multi-occurrence schedule and references to its subject Items. Cancelling and rescheduling the compatibility reminder API controls that Automation directly.

---

Repository architecture and contribution guidance live in `AGENTS.md`.
