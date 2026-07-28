import { describe, expect, it } from 'vitest';
import { MemoryInterpretations } from '../adapters/memory/interpretation.js';
import { Interpretation } from '../domain/interpretation.js';

describe('Interpretation history', () => {
  it('preserves completed historical Interpretations and selects the newest one', async () => {
    const store = new MemoryInterpretations();
    const first = createInterpretation('interpretation-first', '2026-07-18T20:00:00Z');
    const second = createInterpretation('interpretation-second', '2026-07-19T20:00:00Z');

    await store.saveInterpretation(first);
    await store.saveInterpretation(second);

    expect(await store.listInterpretations('entry-knowledge')).toEqual([first, second]);
    expect(await store.findLatestInterpretation('entry-knowledge')).toBe(second);
    expect(first.status).toBe('completed');
    expect(first.interpreter).toEqual({
      key: 'remote-powerful',
    });
  });
});

function createInterpretation(id: string, timestamp: string): Interpretation {
  const interpretation = Interpretation.create({
    id,
    entryId: 'entry-knowledge',
    createdAt: timestamp,
  }).start(timestamp);

  return interpretation.completeKnowledge(
    {
      entryId: interpretation.entryId,
      concepts: [],
      predicates: [],
      axioms: [],
    },
    {
      key: 'remote-powerful',
    },
    {
      conceptIds: [],
      predicateIds: [],
      axiomIds: [],
      linkIds: [],
    },
    timestamp,
  );
}
