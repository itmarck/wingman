import { describe, expect, it } from 'vitest';
import type { IdGenerator } from '../../../system/runtime.js';
import { MemoryKnowledgeStore } from '../adapters/memory/store.js';
import { RegisterConceptCommand } from '../operations/register.js';
import { ResolveConceptQuery } from '../operations/resolve.js';

describe('resolve Concept', () => {
  it('distinguishes an exact match from ambiguous candidates', async () => {
    const store = new MemoryKnowledgeStore();
    const ids = new TestIds(['concept-rust-language', 'concept-rust-game']);
    const register = new RegisterConceptCommand(store, ids);
    const resolve = new ResolveConceptQuery(store);

    const language = await register.execute({
      name: 'Rust',
      aliases: ['Rust language'],
      definition: 'Programming language',
    });
    const game = await register.execute({
      name: 'Rust',
      aliases: ['Rust game'],
      definition: 'Survival video game',
    });

    expect(await resolve.execute({ name: 'Rust' })).toEqual({
      status: 'ambiguous',
      candidates: [language, game],
    });
    expect(
      await resolve.execute({
        name: 'Rust',
        definition: 'Programming language',
      }),
    ).toEqual({
      status: 'matched',
      candidates: [language],
    });
  });
});

class TestIds implements IdGenerator {
  readonly #ids: string[];

  constructor(ids: readonly string[]) {
    this.#ids = [...ids];
  }

  generate(): string {
    const id = this.#ids.shift();

    if (!id) {
      throw new Error('No test id available');
    }

    return id;
  }
}
