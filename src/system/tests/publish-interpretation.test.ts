import { describe, expect, it } from 'vitest';
import { EmptyInterpreter } from '../../modules/interpretation/adapters/interpreter.js';
import { defaultProcessingConfig } from '../../modules/interpretation/config.js';
import { createTestSystem } from './support.js';

describe('interpretation publication', () => {
  it('publishes completed interpretation without a proposal gate', async () => {
    const system = createTestSystem({
      adapter: new EmptyInterpreter(),
      processing: defaultProcessingConfig,
    });
    const entryId = await system.capture.captureEntry.execute({
      content: {
        kind: 'text',
        text: 'This Entry has no durable knowledge.',
      },
      origin: {
        source: 'test',
      },
    });

    await system.interpretation.processNext.execute();

    expect((await system.interpretation.getEntryStatus.execute(entryId)).status).toBe('completed');
  });
});
