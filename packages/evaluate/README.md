# Evaluate

Semantic acceptance cases for Wingman. Cases call the configured production inference adapter but use a fresh in-memory system for every repetition. They do not persist Entries, knowledge, Reviews, or telemetry.

## Define cases

Group related cases in a one-word `cases/<group>.ts` file and import that module from `index.ts`.

```ts
import { axioms, define, reviews, status } from '../runner.js';

define('extracts one durable fact', () => ({
  entry: 'AtlasCodex organiza conocimiento personal.',
  expect: [status('completed'), reviews(0), axioms(1)],
}));
```

Built-in expectations are `status()`, `axioms()`, `reviews()`, and `quote()`. A custom `Expectation` returns `undefined` when it passes or an error message when it fails.

## Run

```bash
npm run evaluate
npm run evaluate -- --repeat 5
npm run evaluate -- --case quote --repeat 2
npm run evaluate -- --repeat 2 --attempts 2 --timeout-ms 30000
```

`evaluate` runs structural quality checks and then the semantic cases with the configured inference provider and a fresh in-memory system per case and repetition. The default repeat count is one. Provider errors, failed cases, unstable results, and below-threshold axes exit nonzero.

`npm test` remains deterministic and separate; it does not require provider configuration or consume tokens.
