import type { Item } from '../../../core/item/item.js';
import { normalizeText } from '../../../core/knowledge/guard.js';
import type { ItemStore } from '../ports/store.js';

export interface ItemResolution {
  readonly kind: 'none' | 'single' | 'ambiguous';
  readonly candidates: readonly Item[];
}

export class ResolveItemQuery {
  constructor(private readonly store: ItemStore) {}
  async execute(name: string): Promise<ItemResolution> {
    const candidates = await this.store.findItems(normalizeText(name));
    return Object.freeze({
      kind: candidates.length === 0 ? 'none' : candidates.length === 1 ? 'single' : 'ambiguous',
      candidates,
    });
  }
}
