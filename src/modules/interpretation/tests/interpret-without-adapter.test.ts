import { describe, expect, it } from 'vitest';
import { EmptyInterpreter } from '../adapters/interpreter.js';

describe('interpret without a configured adapter', () => {
  it('returns an explicit empty interpretation', async () => {
    await expect(new EmptyInterpreter().interpret()).resolves.toEqual({
      kind: 'empty',
    });
  });
});
