import { Entry, type EntryContent, type EntryOrigin } from '../../../core/knowledge/entry.js';
import type { Clock, IdGenerator } from '../../../system/runtime.js';
import { Interpretation } from '../../interpretation/domain/interpretation.js';
import type { InterpretationLifecycle } from '../../interpretation/ports/lifecycle.js';

export interface CaptureEntryInput {
  readonly content: EntryContent;
  readonly origin: EntryOrigin;
}

export interface PreparedCapture {
  readonly entry: Entry;
  readonly interpretation: Interpretation;
}

/**
 * Captures and preserves original information.
 */
export class CaptureEntryCommand {
  constructor(
    private readonly lifecycle: InterpretationLifecycle,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CaptureEntryInput): Promise<string> {
    return this.commit(this.prepare(input));
  }

  prepare(input: CaptureEntryInput): PreparedCapture {
    const capturedAt = this.clock.now().toISOString();
    const entry = Entry.create({
      ...input,
      id: this.ids.generate(),
      capturedAt,
    });
    const interpretation = Interpretation.create({
      id: this.ids.generate(),
      entryId: entry.id,
      createdAt: capturedAt,
    });

    return Object.freeze({
      entry,
      interpretation,
    });
  }

  async commit(prepared: PreparedCapture): Promise<string> {
    const stored = await this.lifecycle.capture(prepared.entry, () => prepared.interpretation);

    return stored.id;
  }
}
