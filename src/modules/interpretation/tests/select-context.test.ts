import { describe, expect, it } from 'vitest';
import { Axiom } from '../../../core/knowledge/axiom.js';
import { Concept } from '../../../core/knowledge/concept.js';
import { Entry } from '../../../core/knowledge/entry.js';
import { Predicate } from '../../../core/knowledge/predicate.js';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';

describe('in-memory Interpretation context', () => {
  it('selects mentioned Concepts, one-hop knowledge, and the Predicate catalog', async () => {
    const store = new MemoryKnowledgeStore();
    const seed = Entry.create({
      id: 'entry-seed',
      content: {
        kind: 'text',
        text: 'Wingman initially used Notion.',
      },
      origin: {
        source: 'test',
      },
      capturedAt: '2026-07-19T00:00:00Z',
    });
    const wingman = Concept.create({
      id: 'concept-wingman',
      name: 'Wingman',
      definition: 'Personal knowledge engine',
    });
    const notion = Concept.create({
      id: 'concept-notion',
      name: 'Notion',
      definition: 'Workspace service',
    });
    const usesStorage = Predicate.create({
      id: 'predicate-uses-storage',
      key: 'usesStorage',
      definition: 'Identifies primary storage',
      origin: 'custom',
      scope: 'axiom',
    });
    const axiom = Axiom.create({
      id: 'axiom-storage',
      entryId: seed.id,
      subjectConceptId: wingman.id,
      predicateId: usesStorage.id,
      object: {
        kind: 'concept',
        conceptId: notion.id,
      },
    });

    await store.saveEntry(seed);
    await store.saveInterpretation({
      concepts: [wingman, notion],
      predicates: [usesStorage],
      axioms: [axiom],
      links: [],
    });

    const context = await store.findInterpretationContext(
      Entry.create({
        id: 'entry-new',
        content: {
          kind: 'text',
          text: 'Wingman cambiará su almacenamiento.',
        },
        origin: {
          source: 'test',
        },
        capturedAt: '2026-07-19T01:00:00Z',
      }),
    );

    expect(context.concepts.map((concept) => concept.id)).toEqual([wingman.id, notion.id]);
    expect(context.axioms).toEqual([axiom]);
    expect(context.predicates.some((predicate) => predicate.key === 'usesStorage')).toBe(true);
    expect(context.predicates.some((predicate) => predicate.key === 'system.supersedes')).toBe(
      true,
    );
  });
});
