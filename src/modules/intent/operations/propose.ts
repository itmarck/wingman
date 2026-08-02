import type { ComponentRevisionId } from '../../../core/item/component.js';
import type { EntryId } from '../../../core/knowledge/entry.js';
import type { IdGenerator } from '../../../system/runtime.js';
import { Intent } from '../domain/intent.js';
import type { IntentStore } from '../ports/store.js';

export interface ProposeIntentInput {
  readonly key: string;
  readonly entryId: EntryId;
  readonly revisionIds?: readonly ComponentRevisionId[];
  readonly scheduledFor?: string;
}

/**
 * Persists an action proposal without authorizing or executing it.
 */
export class ProposeIntentCommand {
  constructor(
    private readonly store: IntentStore,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: ProposeIntentInput): Promise<string> {
    const intent = Intent.create({
      ...input,
      id: this.ids.generate(),
    });

    await this.store.saveIntent(intent);

    return intent.id;
  }
}
