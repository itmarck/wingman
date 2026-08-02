/** Framework-neutral semantic cases locked before the legacy model is removed. */
export const knowledgeParityFixtures = Object.freeze([
  {
    key: 'identity',
    entry: 'Rust es un lenguaje de programación.',
    expected: 'stable identity and aliases',
  },
  { key: 'literal', entry: 'El límite es 10.', expected: 'typed literal Component value' },
  {
    key: 'relationship',
    entry: 'Marcelo trabaja en Acme como ingeniero desde 2024.',
    expected: 'relationship Item with roles and valid time',
  },
  {
    key: 'citation',
    entry: 'Wingman preserva “citas exactas”.',
    expected: 'exact quote and source locator',
  },
  {
    key: 'supersession',
    entry: 'Wingman ahora usa PostgreSQL.',
    expected: 'new revision supersedes the old revision',
  },
  {
    key: 'conflict',
    entry: 'La reunión empieza a las 10.',
    expected: 'conflicting candidates remain current',
  },
  {
    key: 'review',
    entry: 'Rust es importante.',
    expected: 'ambiguous identity requests a generic Review',
  },
] as const);
