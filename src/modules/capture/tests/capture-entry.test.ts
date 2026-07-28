import { describe, expect, it } from 'vitest';
import { MemoryLock } from '../../../adapters/memory/lock.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import { MemoryInterpretations } from '../../interpretation/adapters/memory/interpretation.js';
import { MemoryInterpretationLifecycle } from '../../interpretation/adapters/memory/lifecycle.js';
import { MemoryReviewStore } from '../../interpretation/adapters/memory/review.js';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';
import { CaptureEntryCommand } from '../operations/capture.js';
import { ListEntriesQuery } from '../operations/list.js';

describe('ingest Entry', () => {
  it('validates and stores the original information without changing it', async () => {
    const store = new MemoryKnowledgeStore();
    const interpretations = new MemoryInterpretations();
    const lifecycle = createLifecycle(store, interpretations);
    const runtime = new TestRuntime(
      ['entry-reminder', 'interpretation-reminder'],
      '2026-07-18T19:00:00Z',
    );
    const command = new CaptureEntryCommand(lifecycle, runtime, runtime);
    const query = new ListEntriesQuery(store);
    const input = {
      content: {
        kind: 'text' as const,
        text: 'Mañana a las 6 pm recuérdame comprar una crema.',
      },
      origin: {
        source: 'minima',
        externalId: 'local-entry-42',
      },
    };

    const entryId = await command.execute(input);
    const { items } = await query.execute();
    const [storedEntry] = items;
    const entry = requireValue(storedEntry, 'Expected a captured Entry');

    expect(entryId).toBe(entry.id);
    expect(entry.content).toEqual(input.content);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.content)).toBe(true);
    expect(Object.isFrozen(entry.origin)).toBe(true);
    expect((await query.execute()).items).toEqual([entry]);
    expect((await interpretations.findLatestInterpretation(entry.id))?.status).toBe('queued');
  });

  it('does not store invalid information', async () => {
    const store = new MemoryKnowledgeStore();
    const interpretations = new MemoryInterpretations();
    const lifecycle = createLifecycle(store, interpretations);
    const runtime = new TestRuntime(['entry-empty'], '2026-07-18T19:00:00Z');
    const command = new CaptureEntryCommand(lifecycle, runtime, runtime);
    const query = new ListEntriesQuery(store);

    await expect(
      command.execute({
        content: {
          kind: 'text',
          text: '',
        },
        origin: {
          source: 'minima',
        },
      }),
    ).rejects.toThrow('Entry text cannot be empty');
    expect((await query.execute()).items).toEqual([]);
  });

  it('publishes neither Entry nor Interpretation when atomic capture cannot finish', async () => {
    const store = new MemoryKnowledgeStore();
    const interpretations = new MemoryInterpretations();
    const lifecycle = createLifecycle(store, interpretations);
    const runtime = new TestRuntime(['entry-without-interpretation'], '2026-07-18T19:00:00Z');
    const command = new CaptureEntryCommand(lifecycle, runtime, runtime);

    await expect(
      command.execute({
        content: {
          kind: 'text',
          text: 'This capture cannot allocate its Interpretation.',
        },
        origin: {
          source: 'minima',
          externalId: 'atomic-capture-failure',
        },
      }),
    ).rejects.toThrow('No test id available');

    expect((await store.listEntries({ limit: 50, scope: 'entries' })).items).toEqual([]);
  });

  it('reuses an external capture without treating equal text as universal identity', async () => {
    const store = new MemoryKnowledgeStore();
    const interpretations = new MemoryInterpretations();
    const lifecycle = createLifecycle(store, interpretations);
    const runtime = new TestRuntime(
      [
        'entry-first',
        'interpretation-first',
        'entry-retry',
        'entry-repeated',
        'interpretation-repeated',
        'entry-conflict',
        'capture-conflict',
        'interpretation-conflict',
      ],
      '2026-07-18T19:00:00Z',
    );
    const command = new CaptureEntryCommand(lifecycle, runtime, runtime);
    const content = {
      kind: 'text' as const,
      text: 'Take medicine',
    };

    const firstId = await command.execute({
      content,
      origin: {
        source: 'minima',
        externalId: 'submission-1',
      },
    });
    const retryId = await command.execute({
      content,
      origin: {
        source: 'minima',
        externalId: 'submission-1',
      },
    });
    const repeatedId = await command.execute({
      content,
      origin: {
        source: 'minima',
        externalId: 'submission-2',
      },
    });

    expect(retryId).toBe(firstId);
    expect(repeatedId).not.toBe(firstId);
    expect((await store.listEntries({ limit: 50, scope: 'entries' })).items).toHaveLength(2);

    await expect(
      command.execute({
        content: {
          kind: 'text',
          text: 'Different content',
        },
        origin: {
          source: 'minima',
          externalId: 'submission-1',
        },
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
    });
  });
});

function createLifecycle(
  store: MemoryKnowledgeStore,
  interpretations: MemoryInterpretations,
): MemoryInterpretationLifecycle {
  return new MemoryInterpretationLifecycle(
    store,
    interpretations,
    new MemoryReviewStore(),
    new MemoryLock(),
  );
}

class TestRuntime implements Clock, IdGenerator {
  readonly #ids: string[];
  readonly #date: Date;

  constructor(ids: readonly string[], timestamp: string) {
    this.#ids = [...ids];
    this.#date = new Date(timestamp);
  }

  generate(): string {
    const id = this.#ids.shift();

    if (!id) {
      throw new Error('No test id available');
    }

    return id;
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
