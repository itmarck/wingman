import { describe, expect, it } from 'vitest';
import { Concept } from '../../../core/knowledge/concept.js';
import { MemoryKnowledgeStore } from '../adapters/memory/store.js';

describe('accumulate Concept aliases', () => {
  it('extends aliases without changing canonical identity or removing existing aliases', async () => {
    const store = new MemoryKnowledgeStore();
    const concept = Concept.create({
      id: 'concept-system',
      name: 'System',
      definition: 'Personal knowledge engine',
    });

    await store.saveConcept(concept);
    await store.saveConcept(concept.addAliases(['Personal assistant']));

    const stored = (await store.loadKnowledge()).concepts[0];

    expect(stored?.aliases).toEqual(['Personal assistant']);
    await expect(
      store.saveConcept(
        Concept.create({
          id: concept.id,
          name: concept.name,
          definition: concept.definition,
        }),
      ),
    ).rejects.toThrow('cannot remove aliases');
  });
});
