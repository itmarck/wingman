import { axioms, define, quote, reviews, status } from '../runner.js';

define('preserves a public description as an exact Spanish quote', () => ({
  entry: 'La descripción pública de Example es «Un archivo para ideas que evolucionan».',
  expect: [
    status('completed'),
    reviews(0),
    axioms(1),
    quote('Un archivo para ideas que evolucionan'),
  ],
}));
