import {
  ComponentRevision,
  type CreateComponentRevisionInput,
} from '../../../core/item/component.js';
import { type CreateItemInput, Item } from '../../../core/item/item.js';
import type { SchemaRegistry } from '../../../core/item/registry.js';
import type { IdGenerator } from '../../../system/runtime.js';
import type { ItemStore } from '../ports/store.js';

/** Atomically registers one Item and its initial evidence-backed Components. */
export class RegisterItemCommand {
  constructor(
    private readonly store: ItemStore,
    private readonly registry: SchemaRegistry,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    input: Omit<CreateItemInput, 'id'> & {
      readonly id?: string;
      readonly components: readonly Omit<CreateComponentRevisionInput, 'id' | 'itemId'>[];
    },
  ): Promise<Item> {
    const item = Item.create({
      id: input.id ?? this.ids.generate(),
      createdAt: input.createdAt,
      profile: input.profile,
    });
    const revisions = input.components.map((component) =>
      ComponentRevision.create({ ...component, id: this.ids.generate(), itemId: item.id }),
    );
    this.registry.validateComposition(item, revisions);
    await this.store.saveItems({ items: [item], revisions });
    return item;
  }
}
