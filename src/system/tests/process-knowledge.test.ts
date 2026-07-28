import { describe, expect, it } from 'vitest';
import { MemoryLock } from '../../adapters/memory/lock.js';
import { CaptureEntryCommand } from '../../modules/capture/operations/capture.js';
import { ProposeIntentCommand } from '../../modules/intent/operations/propose.js';
import { MemoryInterpretations } from '../../modules/interpretation/adapters/memory/interpretation.js';
import { MemoryInterpretationLifecycle } from '../../modules/interpretation/adapters/memory/lifecycle.js';
import { MemoryReviewStore } from '../../modules/interpretation/adapters/memory/review.js';
import { Interpretation } from '../../modules/interpretation/domain/interpretation.js';
import { RegisterInterpretationCommand } from '../../modules/interpretation/services/register.js';
import { MemoryKnowledgeStore } from '../../modules/knowledge/adapters/memory/store.js';
import { MemoryProjectionRegistry } from '../../modules/projection/adapters/memory/registry.js';
import { CurrentAxiomsProjection } from '../../modules/projection/domain/axioms.js';
import { GlossaryProjection } from '../../modules/projection/domain/glossary.js';
import { ListProjectionsQuery } from '../../modules/projection/operations/list.js';
import { ReadProjectionQuery } from '../../modules/projection/operations/read.js';
import type { Clock, IdGenerator } from '../runtime.js';

describe('knowledge application flow', () => {
  it('captures, interprets, projects and proposes without executing', async () => {
    const store = new MemoryKnowledgeStore();
    const interpretations = new MemoryInterpretations();
    const runtime = new TestRuntime(
      [
        'entry-decision',
        'interpretation-decision',
        'concept-projection',
        'concept-core',
        'predicate-belongs-to',
        'predicate-defines',
        'predicate-supports',
        'axiom-decision',
        'axiom-evidence',
        'link-support',
        'axiom-decision-reprocessed',
        'axiom-evidence-reprocessed',
        'link-support-reprocessed',
        'intent-review',
      ],
      '2026-07-18T20:00:00Z',
    );
    const reviews = new MemoryReviewStore();
    const lifecycle = new MemoryInterpretationLifecycle(
      store,
      interpretations,
      reviews,
      new MemoryLock(),
    );
    const capture = new CaptureEntryCommand(lifecycle, runtime, runtime);
    const register = new RegisterInterpretationCommand(store, reviews, lifecycle, runtime, runtime);
    const propose = new ProposeIntentCommand(store, runtime);
    const registry = new MemoryProjectionRegistry([
      new GlossaryProjection(),
      new CurrentAxiomsProjection(),
    ]);
    const listProjections = new ListProjectionsQuery(registry);
    const readProjection = new ReadProjectionQuery(store, registry);

    const entryId = await capture.execute({
      content: {
        kind: 'text',
        text: 'Projection belongs to the Core.',
      },
      origin: {
        source: 'minima',
      },
    });
    const interpretation = {
      entryId,
      concepts: [
        {
          reference: 'projection',
          name: 'Projection',
          definition: 'Derived view of Wingman knowledge',
        },
        {
          reference: 'core',
          name: 'Core',
          definition: 'Stable heart of Wingman',
        },
      ],
      predicates: [
        {
          key: 'belongsTo',
          definition: 'Indicates architectural ownership',
          origin: 'custom' as const,
          scope: 'axiom' as const,
        },
        {
          key: 'defines',
          definition: 'Indicates a defining architectural relationship',
          origin: 'custom' as const,
          scope: 'axiom' as const,
        },
        {
          key: 'supports',
          definition: 'Indicates supporting evidence between Axioms',
          origin: 'custom' as const,
          scope: 'link' as const,
        },
      ],
      axioms: [
        {
          reference: 'decision',
          subjectReference: 'projection',
          predicateKey: 'belongsTo',
          object: {
            kind: 'concept' as const,
            conceptReference: 'core',
          },
        },
        {
          reference: 'evidence',
          subjectReference: 'core',
          predicateKey: 'defines',
          object: {
            kind: 'concept' as const,
            conceptReference: 'projection',
          },
        },
      ],
      links: [
        {
          sourceReference: 'evidence',
          predicateKey: 'supports',
          targetReference: 'decision',
        },
      ],
    };

    const initial = requireValue(
      await interpretations.findLatestInterpretation(entryId),
      'Expected initial Interpretation',
    ).start(runtime.now().toISOString());
    const identity = {
      key: 'test',
    };

    await register.execute(initial, interpretation, identity);

    const reprocessing = Interpretation.create({
      id: 'interpretation-reprocessed',
      entryId,
      createdAt: runtime.now().toISOString(),
    }).start(runtime.now().toISOString());

    await register.execute(reprocessing, interpretation, identity);

    const snapshot = await store.loadKnowledge();
    const axiom = requireValue(snapshot.axioms[0], 'Expected a registered Axiom');
    const intentId = await propose.execute({
      key: 'review.request',
      entryId,
      axiomIds: [axiom.id],
    });
    const glossary = await readProjection.execute('system.glossary');
    const currentAxioms = await readProjection.execute('system.currentAxioms');

    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.concepts).toHaveLength(2);
    expect(snapshot.predicates).toHaveLength(4);
    expect(snapshot.axioms).toHaveLength(2);
    expect(snapshot.links).toHaveLength(1);
    expect(glossary.data.concepts).toHaveLength(2);
    expect(currentAxioms.data.axioms).toHaveLength(2);
    expect(listProjections.execute().map((metadata) => metadata.key)).toEqual([
      'system.glossary',
      'system.currentAxioms',
    ]);
    expect(intentId).toBe('intent-review');
    expect(store.listIntents()).toHaveLength(1);

    const duplicatePredicate = {
      ...interpretation,
      predicates: interpretation.predicates.map((predicate) =>
        predicate.key === 'belongsTo'
          ? {
              ...predicate,
              key: 'ownedBy',
            }
          : predicate,
      ),
      axioms: interpretation.axioms.map((axiom) =>
        axiom.predicateKey === 'belongsTo'
          ? {
              ...axiom,
              predicateKey: 'ownedBy',
            }
          : axiom,
      ),
    };
    const invalid = Interpretation.create({
      id: 'interpretation-duplicate-predicate',
      entryId,
      createdAt: runtime.now().toISOString(),
    }).start(runtime.now().toISOString());

    await expect(register.execute(invalid, duplicatePredicate, identity)).rejects.toThrow(
      'Predicate ownedBy duplicates the registered meaning belongsTo',
    );
  });
});

class TestRuntime implements Clock, IdGenerator {
  readonly #ids: string[];
  readonly #date: Date;

  constructor(ids: readonly string[], timestamp: string) {
    this.#ids = [...ids];
    this.#date = new Date(timestamp);
  }

  generate(): string {
    return requireValue(this.#ids.shift(), 'No test id available');
  }

  now(): Date {
    return new Date(this.#date);
  }
}

function requireValue<Value>(value: Value | undefined, message: string): Value {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}
