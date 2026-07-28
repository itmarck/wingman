import { describe, expect, it } from 'vitest';
import { MemoryKnowledgeStore } from '../../knowledge/adapters/memory/store.js';
import { MemoryProjectionRegistry } from '../adapters/memory/registry.js';
import { ReadProjectionQuery } from '../operations/read.js';

describe('read Projection', () => {
  it('returns a structured error when the requested Projection does not exist', async () => {
    const readProjection = new ReadProjectionQuery(
      new MemoryKnowledgeStore(),
      new MemoryProjectionRegistry([]),
    );

    await expect(readProjection.execute('system.missing')).rejects.toMatchObject({
      name: 'NotFoundError',
      code: 'notFound',
      message: 'Projection system.missing does not exist',
    });
  });
});
