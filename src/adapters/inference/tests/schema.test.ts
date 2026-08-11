import { describe, expect, it } from 'vitest';
import { parseInterpretationOutput } from '../schema.js';

describe('interpretation declaration schema', () => {
  it('accepts one ordered collection of the four stable declarations', () => {
    const output = parseInterpretationOutput(
      knowledge([
        {
          kind: 'item',
          version: 1,
          reference: 'task',
          dependsOn: [],
          unresolved: [],
          profile: { key: 'task', version: 1 },
          referenceStatus: 'identified',
          components: [component('task.descriptive', 'descriptive', { title: 'Pagar' })],
        },
        {
          kind: 'state',
          version: 1,
          reference: 'goal',
          dependsOn: ['task'],
          unresolved: [],
          modality: 'desired',
          condition: { operator: { key: 'equal', version: 1 }, operands: [] },
          validTime: null,
          confidence: null,
        },
        {
          kind: 'automation',
          version: 1,
          reference: 'notice',
          dependsOn: ['task'],
          unresolved: [],
          subjects: ['task'],
          given: [],
          when: {
            operator: { key: 'schedule', version: 1 },
            occurrences: ['2026-08-31T12:00:00.000Z'],
          },
          thenIntents: [
            {
              capability: { key: 'notification', version: 1 },
              input: { message: 'Pagar' },
              conditions: [],
              expectedState: [],
              consent: 'none',
            },
          ],
          controls: null,
        },
        {
          kind: 'intent',
          version: 1,
          reference: 'action',
          dependsOn: [],
          unresolved: [],
          capability: { key: 'notification', version: 1 },
          input: {},
          conditions: [],
          expectedState: [],
          consent: 'explicit',
          trigger: null,
        },
      ]),
    );
    expect(output).toMatchObject({
      kind: 'knowledge',
      draft: {
        declarations: [
          { kind: 'item' },
          { kind: 'state' },
          { kind: 'automation' },
          { kind: 'intent' },
        ],
      },
    });
  });

  it('rejects product-specific shapes, invalid consent, and model decisions', () => {
    expect(
      parseInterpretationOutput(
        knowledge([{ kind: 'shoppingRequest', version: 1, reference: 'buy' }]),
      ),
    ).toBeUndefined();
    expect(
      parseInterpretationOutput(
        knowledge([
          {
            kind: 'automation',
            version: 1,
            reference: 'notice',
            dependsOn: [],
            unresolved: [],
            subjects: [],
            given: [],
            when: { operator: 'schedule', occurrences: ['2026-08-31T12:00:00.000Z'] },
            thenIntents: [],
            controls: null,
          },
        ]),
      ),
    ).toBeUndefined();
    expect(
      parseInterpretationOutput(
        knowledge([
          {
            kind: 'intent',
            version: 1,
            reference: 'notice',
            dependsOn: [],
            unresolved: [],
            capability: { key: 'notification', version: 1 },
            input: {},
            conditions: [],
            expectedState: [],
            consent: 'execute',
            trigger: null,
          },
        ]),
      ),
    ).toBeUndefined();
    expect(parseInterpretationOutput(knowledge([], { decisions: [] }))).toBeUndefined();
  });

  it('drops empty filler Components and their orphan descriptive Item', () => {
    const value = knowledge([
      {
        kind: 'item',
        version: 1,
        reference: 'filler',
        dependsOn: [],
        unresolved: [],
        profile: null,
        referenceStatus: 'identified',
        components: [component('emptyQuote', 'quote', '')],
      },
    ]);
    expect(parseInterpretationOutput(value)).toMatchObject({
      kind: 'knowledge',
      draft: { declarations: [] },
    });
  });
});

function knowledge(
  declarations: readonly Record<string, unknown>[],
  extraDraft: Record<string, unknown> = {},
) {
  return {
    kind: 'knowledge' as const,
    reason: null,
    draft: { entryId: 'entry-1', declarations, resolutions: [], ...extraDraft },
  };
}

function component(reference: string, key: string, value: unknown) {
  return {
    reference,
    key,
    schemaVersion: 1,
    value,
    sourceLocators: [],
    validTime: null,
    status: 'accepted',
    supersedesReference: null,
  };
}
