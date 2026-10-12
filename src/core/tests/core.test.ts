import { randomUUID } from 'node:crypto';
import { jwtVerify } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { createAccessToken } from '../../platform/auth.js';
import { createClassifier } from '../../platform/decisions.js';
import { detectDates, instant, localDay } from '../dates.js';
import { canParent } from '../entries.js';
import { areas, fieldsValid, valuesValid } from '../model.js';
import { buildQuestions, interpret, type JevAnswer, questionsOf } from '../questions.js';
import { deriveNotices, rankTasks, type TaskFacts } from '../tasks.js';

const lima = 'America/Lima';
const now = new Date('2026-10-11T15:00:00Z');

describe('core validation', () => {
  it('preserves falsy values and rejects invalid fields', () => {
    const number = randomUUID(),
      boolean = randomUUID(),
      text = randomUUID(),
      url = randomUUID();
    const fields = [
      { id: number, name: 'Number', type: 'number' as const },
      { id: boolean, name: 'Boolean', type: 'boolean' as const },
      { id: text, name: 'Text', type: 'text' as const },
      { id: url, name: 'Link', type: 'url' as const },
    ];
    expect(() =>
      valuesValid(fields, { [number]: 0, [boolean]: false, [text]: '', [url]: null }),
    ).not.toThrow();
    expect(() => valuesValid(fields, { [url]: 'ftp://x' })).toThrow('HTTP');
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
  });
  it('only lets projects parent non-project Entries', () => {
    expect(canParent('project', 'task')).toBe(true);
    expect(canParent('project', 'project')).toBe(false);
    expect(canParent('task', 'task')).toBe(false);
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

describe('dates', () => {
  it('converts local days and detects Spanish dates', () => {
    expect(localDay(new Date('2026-10-12T03:00:00Z'), lima)).toBe('2026-10-11');
    expect(instant('2026-10-11', lima).toISOString()).toBe('2026-10-11T05:00:00.000Z');
    expect(detectDates('Llamar al banco mañana', 'task', now, lima)).toEqual({
      plannedFor: '2026-10-12',
    });
    expect(detectDates('Pagar luz mañana a las 3 pm', 'task', now, lima).dueAt?.toISOString()).toBe(
      '2026-10-12T20:00:00.000Z',
    );
    expect(
      detectDates('Entregar informe antes del viernes', 'task', now, lima).dueAt,
    ).toBeDefined();
    expect(detectDates('Ayer fui al cine', 'note', now, lima).occurredAt?.toISOString()).toBe(
      '2026-10-10T05:00:00.000Z',
    );
    expect(detectDates('Comprar pan', 'task', now, lima)).toEqual({});
  });
});

describe('tasks', () => {
  const task = (patch: Partial<TaskFacts>): TaskFacts => ({
    id: randomUUID(),
    title: 'Tarea',
    area: 'maintenance',
    parentId: null,
    plannedFor: null,
    dueAt: null,
    createdAt: now,
    context: null,
    effort: null,
    importance: null,
    postponed: 0,
    skippedToday: false,
    ...patch,
  });
  it('ranks overdue and planned tasks first and hides future plans', () => {
    const overdue = task({ title: 'overdue', dueAt: new Date('2026-10-10T00:00:00Z') });
    const today = task({ title: 'today', plannedFor: '2026-10-11' });
    const future = task({ title: 'future', plannedFor: '2026-10-20' });
    const skipped = task({ title: 'skipped', plannedFor: '2026-10-11', skippedToday: true });
    const ranked = rankTasks([skipped, future, today, overdue], { now, today: '2026-10-11' });
    expect(ranked.map((t) => t.title)).toEqual(['overdue', 'today', 'skipped']);
  });
  it('derives passive notices', () => {
    const base = {
      kind: 'task' as const,
      attempts: 1,
      error: null,
      finishedAt: null,
      createdAt: now,
    };
    const notices = deriveNotices(
      [
        { ...base, id: 'a', title: 'A', dueAt: new Date('2026-10-11T10:00:00Z') },
        { ...base, id: 'b', title: 'B', dueAt: new Date('2026-10-11T20:00:00Z') },
        { ...base, id: 'c', title: 'C', dueAt: null, attempts: 3, error: 'JEV HTTP 500' },
      ],
      now,
    );
    expect(notices.map((n) => n.type).sort()).toEqual(['dueSoon', 'overdue', 'processingFailed']);
  });
});

const probabilities = (keys: string[], selected: string) =>
  Object.fromEntries(keys.map((key) => [key, key === selected ? 1 : 0]));

describe('questions', () => {
  it('asks per kind, maps projects and applies thresholds', () => {
    const projectId = randomUUID();
    const definitions = buildQuestions('task', [
      { id: projectId, title: 'Casa nueva', text: 'Casa nueva' },
    ]);
    expect(Object.keys(definitions)).toEqual([
      'area',
      'context',
      'effort',
      'importance',
      'project',
    ]);
    expect(Object.keys(buildQuestions('note', []))).toEqual(['area']);
    const answers: Record<string, JevAnswer> = {
      area: {
        type: 'choice',
        choice: 'maintenance',
        confidence: 0.1,
        probabilities: probabilities(Object.keys(areas), 'maintenance'),
      },
      context: { type: 'choice', choice: 'home', confidence: 0.3, probabilities: {} },
      effort: { type: 'score', score: 1.4, confidence: 0.9, probabilities: {} },
      importance: { type: 'score', score: 2.6, confidence: 0.2, probabilities: {} },
      project: { type: 'choice', choice: 'Casa nueva', confidence: 0.9, probabilities: {} },
    };
    const { attributes, applied } = interpret(definitions, answers);
    expect(attributes).toEqual({ area: 'maintenance', effort: 1, parentId: projectId });
    expect(applied.context.applied).toBe(false);
  });
});

describe('JEV transport', () => {
  it('sends state and questions and validates each answer type', async () => {
    const definitions = buildQuestions('task', []);
    const body = {
      model: 'jev-1.13.0',
      answers: {
        area: {
          type: 'choice',
          choice: 'maintenance',
          confidence: 0.95,
          probabilities: probabilities(Object.keys(areas), 'maintenance'),
        },
        context: {
          type: 'choice',
          choice: 'outside',
          confidence: 0.9,
          probabilities: probabilities(['home', 'computer', 'outside', 'phone'], 'outside'),
        },
        effort: {
          type: 'score',
          score: 0.2,
          confidence: 0.8,
          probabilities: probabilities(['0', '1', '2', '3'], '0'),
        },
        importance: {
          type: 'score',
          score: 1,
          confidence: 0.8,
          probabilities: probabilities(['0', '1', '2', '3'], '1'),
        },
      },
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(body)))
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...body,
            answers: { ...body.answers, area: { type: 'noul', noul: 1 } },
          }),
        ),
      );
    const classify = createClassifier('test-key', 'jev-1.13.0', request);
    const state = { kind: 'task', text: 'Comprar pan', preferences: [] };
    const result = await classify(state, questionsOf(definitions));
    expect(interpret(definitions, result.answers).attributes).toEqual({
      area: 'maintenance',
      context: 'outside',
      effort: 0,
      importance: 1,
    });
    const sent = JSON.parse(request.mock.calls[0][1]?.body as string);
    expect(sent.state.text).toBe('Comprar pan');
    await expect(classify(state, questionsOf(definitions))).rejects.toThrow('429');
    await expect(classify(state, questionsOf(definitions))).rejects.toThrow('Invalid JEV');
  });
});
