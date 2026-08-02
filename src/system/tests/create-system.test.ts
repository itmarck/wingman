import { describe, expect, it } from 'vitest';
import type { InterpretationRequest } from '../../modules/interpretation/services/request.js';
import { createTestSystem } from './support.js';

describe('system composition', () => {
  it('exposes application operations without leaking Stores', async () => {
    const system = createTestSystem({
      adapter: new EmptyInterpreter(),
    });
    const entryId = await system.capture.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'Wingman keeps original information.',
      },
      origin: {
        source: 'minima',
      },
    });

    expect((await system.capture.listEntries.execute()).items[0]?.id).toBe(entryId);
    expect((await system.capture.getEntry.execute(entryId)).id).toBe(entryId);
    expect((await system.interpretation.getEntryStatus.execute(entryId)).status).toBe('queued');
    await expect(system.interpretation.listReviews.execute()).resolves.toMatchObject({
      items: [],
      nextCursor: null,
    });
    expect(system.projection.listProjections.execute().map((projection) => projection.key)).toEqual(
      ['system.currentItems', 'system.glossary'],
    );
    expect(Object.keys(system)).toEqual([
      'capture',
      'interpretation',
      'projection',
      'execution',
      'state',
      'rule',
      'planning',
      'proposals',
      'close',
    ]);

    await system.close();
  });
});

class EmptyInterpreter {
  readonly identity = Object.freeze({
    key: 'empty',
  });

  async interpret(request: InterpretationRequest) {
    return {
      kind: 'knowledge',
      draft: {
        entryId: request.entry.id,
        items: [],
        components: [],
      },
    };
  }
}
