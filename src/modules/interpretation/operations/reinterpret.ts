import { NotFoundError } from '../../../system/error.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import type { EntryStore } from '../../capture/ports/store.js';
import { Interpretation } from '../domain/interpretation.js';
import type { InterpretationLifecycle } from '../ports.js';

export interface ReinterpretEntryInput {
  readonly entryId: string;
}

/**
 * Creates a new Interpretation without altering previous attempts for the Entry.
 */
export class ReinterpretEntryCommand {
  constructor(
    private readonly entries: EntryStore,
    private readonly lifecycle: InterpretationLifecycle,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: ReinterpretEntryInput): Promise<string> {
    const entry = await this.entries.findEntry(input.entryId);

    if (!entry) {
      throw new NotFoundError(`Entry ${input.entryId} does not exist`);
    }

    const interpretation = Interpretation.create({
      id: this.ids.generate(),
      entryId: entry.id,
      createdAt: this.clock.now().toISOString(),
    });

    await this.lifecycle.queue(interpretation);
    return interpretation.id;
  }
}
