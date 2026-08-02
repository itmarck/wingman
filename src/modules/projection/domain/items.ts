import { selectCurrentRevisions } from '../../../core/item/registry.js';
import type { KnowledgeSnapshot } from '../../../core/item/snapshot.js';
import type { Projection, ProjectionResult } from './projection.js';

export interface CurrentItemsResult extends ProjectionResult {
  readonly items: readonly {
    readonly id: string;
    readonly profile?: { readonly key: string; readonly version: number };
    readonly components: readonly unknown[];
  }[];
}

/** Projects stable Items with every unresolved current candidate preserved. */
export class CurrentItemsProjection implements Projection {
  readonly metadata = Object.freeze({
    key: 'system.currentItems',
    name: 'Current Items',
    description: 'Items composed from current evidence-backed Component revisions',
  });
  build(snapshot: KnowledgeSnapshot): CurrentItemsResult {
    const current = selectCurrentRevisions(snapshot.revisions);
    return Object.freeze({
      items: Object.freeze(
        snapshot.items.map((item) =>
          Object.freeze({
            id: item.id,
            profile: item.profile,
            components: Object.freeze(current.filter((revision) => revision.itemId === item.id)),
          }),
        ),
      ),
    });
  }
}
