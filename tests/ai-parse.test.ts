import { describe, it, expect } from 'vitest';
import { extractJSON, parseClassification, parseRaw } from '../shared/ai/parse.js';

describe('extractJSON', () => {
  it('parses bare JSON', () => {
    expect(extractJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json fences (Claude/Ollama default)', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('strips bare ``` fences', () => {
    expect(extractJSON('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('throws on invalid JSON (caller fails closed)', () => {
    expect(() => extractJSON('not json')).toThrow();
  });
});

describe('parseClassification', () => {
  it('requires the classification field', () => {
    expect(() => parseClassification('{"category":"x"}')).toThrow(/classification/);
  });

  it('returns the parsed object when valid', () => {
    const r = parseClassification('{"classification":"urgent","category":"security"}');
    expect(r.classification).toBe('urgent');
    expect(r.category).toBe('security');
  });
});

describe('parseRaw', () => {
  it('rejects non-object responses (e.g. plain string)', () => {
    expect(() => parseRaw('"just a string"')).toThrow();
  });

  it('accepts arbitrary keys without validation', () => {
    expect(parseRaw('{"type":"task","whatever":42}')).toEqual({ type: 'task', whatever: 42 });
  });
});
