import { axioms, define, reviews, status } from '../runner.js';

define('requests a Review before identifying an unknown person', () => ({
  entry: 'Una persona cuya identidad no está indicada creó Wingman en 2026.',
  expect: [status('pending'), reviews(1), axioms(0)],
}));

define('requests a Review before identifying an unknown author', () => ({
  entry: 'Una autora cuya identidad es desconocida escribió el manifiesto de Wingman.',
  expect: [status('pending'), reviews(1), axioms(0)],
}));
