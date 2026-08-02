import { describe, expect, it } from 'vitest';
import { parseInterpretationOutput } from '../schema.js';

describe('interpretation workflow schema', () => {
  it('normalizes closed planning and reminder workflow drafts', () => {
    const output = parseInterpretationOutput({
      kind: 'knowledge',
      reason: null,
      draft: {
        entryId: 'entry-1',
        items: [],
        components: [],
        referenceResolutions: [],
        workflows: [
          {
            kind: 'planningRequest',
            version: 1,
            reference: 'task',
            profile: 'task',
            title: 'Anular tarjeta',
            notes: null,
            temporal: { from: null, to: '2026-08-31T23:59:59.000Z', precision: 'month' },
            recurrence: null,
            unresolved: ['{bankName}'],
          },
          {
            kind: 'reminderRequest',
            version: 1,
            reference: 'reminder',
            subjectReference: 'task',
            message: 'Anula la tarjeta',
            temporal: { from: null, to: '2026-08-31T23:59:59.000Z', precision: 'month' },
            schedule: { kind: 'deadlineOffsets', offsetsBeforeMs: [86_400_000] },
            unresolved: [],
          },
        ],
      },
    });
    expect(output).toMatchObject({
      kind: 'knowledge',
      draft: {
        workflows: [
          {
            kind: 'planningRequest',
            notes: undefined,
            recurrence: undefined,
            temporal: { from: undefined },
          },
          { kind: 'reminderRequest', schedule: { kind: 'deadlineOffsets' } },
        ],
      },
    });
  });

  it('rejects invented workflow kinds and malformed temporal policy', () => {
    const base = {
      kind: 'knowledge',
      reason: null,
      draft: { entryId: 'entry-1', items: [], components: [], referenceResolutions: [] },
    };
    expect(
      parseInterpretationOutput({
        ...base,
        draft: { ...base.draft, workflows: [{ kind: 'deleteFolder', version: 1 }] },
      }),
    ).toBeUndefined();
    expect(
      parseInterpretationOutput({
        ...base,
        draft: {
          ...base.draft,
          workflows: [
            {
              kind: 'reminderRequest',
              version: 1,
              reference: 'reminder',
              subjectReference: 'task',
              message: 'Reminder',
              temporal: null,
              schedule: { kind: 'occurrences', at: [] },
              unresolved: [],
            },
          ],
        },
      }),
    ).toBeUndefined();
    expect(
      parseInterpretationOutput({
        ...base,
        draft: {
          ...base.draft,
          workflows: [
            {
              kind: 'planningRequest',
              version: 1,
              reference: 'task',
              profile: 'task',
              title: 'Task',
              notes: null,
              temporal: { from: null, to: 'tomorrow', precision: 'exact' },
              recurrence: null,
              unresolved: [],
            },
          ],
        },
      }),
    ).toBeUndefined();
  });

  it('drops empty provider filler without publishing orphan Items', () => {
    const output = parseInterpretationOutput({
      kind: 'knowledge',
      reason: null,
      draft: {
        entryId: 'entry-1',
        items: [
          { reference: 'filler', profile: null, referenceStatus: 'identified' },
          { reference: 'unknown', profile: null, referenceStatus: 'uncertain' },
        ],
        components: [
          {
            reference: 'emptyQuote',
            itemReference: 'filler',
            key: 'quote',
            schemaVersion: 1,
            value: '',
            sourceLocators: [],
            validTime: null,
            status: 'accepted',
            supersedesReference: null,
          },
          {
            reference: 'emptyStatement',
            itemReference: 'unknown',
            key: 'statement',
            schemaVersion: 1,
            value: { attribute: '', value: '' },
            sourceLocators: [],
            validTime: null,
            status: 'accepted',
            supersedesReference: null,
          },
        ],
        referenceResolutions: [
          {
            reference: 'unknown',
            question: 'Who is this person?',
            candidateItemIds: [],
          },
        ],
        workflows: [],
      },
    });

    expect(output).toMatchObject({
      kind: 'knowledge',
      draft: {
        items: [{ reference: 'unknown' }],
        components: [],
      },
    });
  });
});
