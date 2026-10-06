import { randomUUID } from 'node:crypto';
import { jwtVerify } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { createAccessToken } from '../../platform/auth.js';
import { createClassifier } from '../../platform/decisions.js';
import { areas, fieldsValid, temporal, valuesValid } from '../model.js';

describe('core validation', () => {
  it('preserves falsy values and rejects invalid dates and fields', () => {
    const number = randomUUID(),
      boolean = randomUUID(),
      text = randomUUID();
    expect(() =>
      valuesValid(
        [
          { id: number, name: 'Number', type: 'number' },
          { id: boolean, name: 'Boolean', type: 'boolean' },
          { id: text, name: 'Text', type: 'text' },
        ],
        { [number]: 0, [boolean]: false, [text]: '' },
      ),
    ).not.toThrow();
    expect(() => temporal('2026-02-30')).toThrow('Invalid date');
    expect(() => temporal('2024-02-29')).not.toThrow();
    expect(() =>
      fieldsValid([
        { id: number, name: 'a', type: 'text' },
        { id: number, name: 'b', type: 'text' },
      ]),
    ).toThrow('Duplicate');
    expect(() =>
      valuesValid([{ id: number, name: 'Choice', type: 'select', options: ['a'] }], {
        [number]: 'b',
      }),
    ).toThrow('selection');
    expect(() =>
      valuesValid([{ id: number, name: 'Reference', type: 'reference' }], {
        [number]: randomUUID(),
      }),
    ).toThrow('reference');
  });
  it('signs source as authenticated identity', async () => {
    const token = await createAccessToken('codex', 'test-secret');
    const { payload } = await jwtVerify(token, new TextEncoder().encode('test-secret'), {
      audience: 'wingman',
      subject: 'Marcelo',
    });
    expect(payload.source).toBe('codex');
    await expect(createAccessToken('not a source', 'test-secret')).rejects.toThrow();
  });
});

function response(destination = 'task', confidence = 0.95) {
  const probabilities = (keys: string[], selected: string) =>
    Object.fromEntries(keys.map((key) => [key, key === selected ? 1 : 0]));
  return {
    model: 'jev-1.13.0',
    usage: { input_tokens: 20, output_tokens: 0 },
    answers: {
      destination: {
        type: 'choice',
        choice: destination,
        confidence,
        probabilities: probabilities(['task', 'keep', 'unsupported', 'undetermined'], destination),
      },
      area: {
        type: 'choice',
        choice: 'maintenance',
        confidence: 0.95,
        probabilities: probabilities([...Object.keys(areas), 'undetermined'], 'maintenance'),
      },
    },
  };
}
describe('JEV transport', () => {
  it('sends independent closed questions and preserves Spanish text', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(response())));
    const result = await createClassifier(
      'test-key',
      'jev-1.13.0',
      request,
    )({ text: 'Comprar pan', inputMode: 'Entry' });
    expect(result.decision).toEqual({ destination: 'task', area: 'maintenance' });
    const body = JSON.parse(request.mock.calls[0][1]?.body as string);
    expect(body.state.text).toBe('Comprar pan');
    expect(Object.keys(body.questions)).toEqual(['destination', 'area']);
    expect(request.mock.calls[0][0]).toBe('https://api.typesafe.ai/v1/systemone');
  });
  it('retains uncertain evidence and treats HTTP or malformed responses as technical failures', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(response('task', 0.4))))
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(response('invented'))));
    const classify = createClassifier('test-key', 'jev-1.13.0', request);
    expect((await classify({ text: 'Tal vez', inputMode: 'Entry' })).decision.destination).toBe(
      'undetermined',
    );
    await expect(classify({ text: 'No comprar', inputMode: 'Entry' })).rejects.toThrow('429');
    await expect(classify({ text: 'Texto', inputMode: 'Entry' })).rejects.toThrow('Invalid JEV');
    expect(request).toHaveBeenCalledTimes(3);
  });
});
