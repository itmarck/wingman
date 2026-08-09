import { ComponentRevision } from '../../../core/item/component.js';
import { Item } from '../../../core/item/item.js';
import type { SchemaRegistry } from '../../../core/item/registry.js';
import type { ComponentValue, Evidence, ProfileReference } from '../../../core/item/types.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { PersistStateInput } from '../../state/operations/create.js';
import type { ItemStore } from '../ports/store.js';

export interface ComposeItemInput {
  readonly profile: ProfileReference;
  readonly components: readonly {
    readonly key: string;
    readonly version: number;
    readonly value: ComponentValue;
  }[];
  readonly evidence: readonly Evidence[];
}

interface StateWriter {
  execute(input: PersistStateInput): Promise<string>;
}

/** Materializes any registered Profile without product-specific branching. */
export class ComposeItemCommand {
  constructor(
    private readonly knowledge: ItemStore,
    private readonly states: StateWriter,
    private readonly registry: SchemaRegistry,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: ComposeItemInput): Promise<string> {
    const profile = this.registry.requireProfile(input.profile.key, input.profile.version);
    const now = this.clock.now().toISOString();
    const item = Item.create({ id: this.ids.generate(), createdAt: now, profile: input.profile });
    const supplied = new Map(input.components.map((component) => [component.key, component]));
    const values = new Map(
      (profile.initialComponents ?? []).map((component) => [component.key, component]),
    );
    for (const component of input.components) values.set(component.key, component);
    if (profile.lifecycle)
      values.set(profile.lifecycle.component.key, {
        ...profile.lifecycle.component,
        value: {
          status: profile.lifecycle.initial,
          transitions: [{ to: profile.lifecycle.initial, at: now }],
        },
      });
    const revisions = [...values.values()].map((component) =>
      ComponentRevision.create({
        id: this.ids.generate(),
        itemId: item.id,
        key: component.key,
        schemaVersion: component.version,
        value: component.value,
        evidence: input.evidence,
        recordedAt: now,
      }),
    );
    for (const component of supplied.values())
      this.registry.requireComponent(component.key, component.version).validate(component.value);
    this.registry.validateComposition(item, revisions);
    await this.knowledge.saveItems({ items: [item], revisions });
    for (const template of profile.states ?? [])
      await this.states.execute({
        modality: template.modality,
        condition: {
          operator: template.operator,
          operands: [
            {
              kind: 'component',
              itemId: item.id,
              key: template.component.key,
              field: template.component.field,
            },
            { kind: 'literal', value: template.value },
          ],
        },
        author: { kind: 'user' },
        evidence: input.evidence,
      });
    return item.id;
  }
}
