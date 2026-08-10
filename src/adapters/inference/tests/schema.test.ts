import { describe, expect, it } from 'vitest';
import { parseInterpretationOutput } from '../schema.js';

describe('interpretation declaration schema', () => {
  it('accepts the four stable declaration collections', () => {
    const output = parseInterpretationOutput(
      knowledge({
        items: [
          {
            kind: 'item',
            version: 1,
            reference: 'task',
            dependsOn: [],
            unresolved: [],
            profile: { key: 'task', version: 1 },
            components: [{ key: 'descriptive', version: 1, value: { title: 'Pagar' } }],
          },
        ],
        states: [
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
        ],
        automations: [
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
        ],
        intents: [
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
        ],
      }),
    );
    expect(output).toMatchObject({
      kind: 'knowledge',
      draft: { declarations: { items: [{ kind: 'item' }] } },
    });
  });

  it('rejects product-specific and malformed declaration shapes', () => {
    expect(
      parseInterpretationOutput(
        knowledge({
          items: [{ kind: 'shoppingRequest', version: 1, reference: 'buy' }],
          states: [],
          automations: [],
          intents: [],
        }),
      ),
    ).toBeUndefined();
    expect(
      parseInterpretationOutput(
        knowledge({
          items: [],
          states: [],
          automations: [
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
          ],
          intents: [],
        }),
      ),
    ).toBeUndefined();
    expect(
      parseInterpretationOutput(
        knowledge({
          items: [],
          states: [],
          automations: [],
          intents: [
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
          ],
        }),
      ),
    ).toBeUndefined();
    expect(
      parseInterpretationOutput(
        knowledge(
          { items: [], states: [], automations: [], intents: [] },
          {
            extra: true,
          },
        ),
      ),
    ).toBeUndefined();
  });

  it('drops empty knowledge filler without orphan Items', () => {
    const value = knowledge({ items: [], states: [], automations: [], intents: [] });
    value.draft.items = [{ reference: 'filler', profile: null, referenceStatus: 'identified' }];
    value.draft.components = [
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
    ];
    expect(parseInterpretationOutput(value)).toMatchObject({
      kind: 'knowledge',
      draft: { items: [], components: [] },
    });
  });
});

function knowledge(
  declarations: Record<string, unknown>,
  extraDraft: Record<string, unknown> = {},
) {
  return {
    kind: 'knowledge' as const,
    reason: null,
    draft: {
      entryId: 'entry-1',
      items: [] as Record<string, unknown>[],
      components: [] as Record<string, unknown>[],
      referenceResolutions: [],
      declarations,
      ...extraDraft,
    },
  };
}
