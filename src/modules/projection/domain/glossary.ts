import { selectCurrentRevisions } from '../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import type { Projection, ProjectionResult } from './projection.js';

export interface GlossaryResult extends ProjectionResult {
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly aliases: readonly string[];
    readonly description: string;
  }[];
}

export class GlossaryProjection implements Projection {
  readonly metadata = Object.freeze({
    key: 'system.glossary',
    name: 'Glossary',
    description: 'Canonical Item identities known by the system',
  });
  build(snapshot: KnowledgeSnapshot): GlossaryResult {
    const current = selectCurrentRevisions(snapshot.revisions);
    const read = (itemId: string, key: string) =>
      current.find((revision) => revision.itemId === itemId && revision.key === key)?.value;
    return Object.freeze({
      items: Object.freeze(
        snapshot.items
          .map((item) => {
            const name = read(item.id, 'name');
            const aliases = read(item.id, 'aliases');
            const description = read(item.id, 'description');
            return Object.freeze({
              id: item.id,
              name: typeof name === 'string' ? name : item.id,
              aliases: Object.freeze(
                Array.isArray(aliases)
                  ? aliases.filter((value): value is string => typeof value === 'string')
                  : [],
              ),
              description: typeof description === 'string' ? description : '',
            });
          })
          .sort((left, right) => left.name.localeCompare(right.name)),
      ),
    });
  }
}
