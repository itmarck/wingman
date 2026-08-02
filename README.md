# Wingman

Personal knowledge and automation server. Wingman preserves original Entries, derives structured
knowledge, resolves uncertain Concept references through Reviews, and exposes Projections through
an authenticated API.

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

The built-in projections are `system.currentAxioms`, `system.glossary`, and `system.predicates`.
Together they expose current facts and the Concept and Predicate catalogs needed to interpret their
identities.

Knowledge storage is currently in memory. PostgreSQL stores migrations and inference telemetry.

## Reference resolution

Every Review uses the generic `referenceResolution` contract. A Review asks which Concept a Draft
reference denotes and offers the proposed Concept plus zero or more existing candidates. This
covers names, pronouns, authorship and other uncertain Concept references without case-specific
Review types. Inference marks proposed references as `identified` or `uncertain`; every uncertain
reference must request this Review before it can be published. A Draft may also reference an
existing Concept directly by its context ID without redeclaring it.

Read pending Reviews through `/api/reviews` and `/api/reviews/:id`. Resolve one with
`POST /api/reviews/:id/resolution`; provide `selectedConceptId` to select an existing candidate or
omit it to confirm the proposed Concept. Knowledge remains unpublished until every Review for the
Interpretation is resolved. In `approval` mode the resolution request returns a Proposal; approving
that Proposal applies the decision and resumes publication without blocking the original request.

## Knowledge language

Wingman preserves every Entry exactly as received, including its original language. Spanish is the canonical language for newly derived human-readable knowledge such as Concept names, aliases, definitions, Predicate definitions, Reviews, and invalid reasons.

Internal Predicate keys remain stable English `camelCase`. Proper names, acronyms, quotations, and technical terms may remain in their original language when translation would lose meaning or useful context. An important original-language term may also be retained as an alias. Multilingual search and localized representations are not currently part of the system contract.

Verbatim citations use the `quote` Literal and must match the original text exactly. Plain text
Entries support paragraph locators; URL Entries do not expose verifiable source locations yet.

Repository architecture and contribution guidance live in `AGENTS.md`.
