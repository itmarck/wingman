import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSystem } from '../../../system/tests/support.js';
import type { ProcessingConfig } from '../config.js';
import { InferenceAdapterError, RetryableInferenceError } from '../services/interpreter.js';
import type { InterpretationRequest } from '../services/request.js';

const processing: ProcessingConfig = {
  leaseDurationMs: 60_000,
  leaseRenewalIntervalMs: 10_000,
  pollingIntervalMs: 10,
  retryDelaysMs: {
    transient: [1_000, 3_000],
    quota: [2_000, 4_000],
    invalidResponse: [100, 300],
  },
};

afterEach(() => vi.useRealTimers());

describe('classified interpretation retries', () => {
  it('uses increasing transient delays and exhausts after three attempts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-09T12:00:00.000Z');
    const system = createTestSystem({
      adapter: new FailingAdapter(() => new RetryableInferenceError('transient', 'offline')),
      processing,
    });
    const entryId = await capture(system);

    await expect(system.interpretation.processNext.execute()).rejects.toThrow('offline');
    expect(await status(system, entryId)).toMatchObject({
      attempts: 1,
      availableAt: '2026-08-09T12:00:01.000Z',
    });
    vi.advanceTimersByTime(1_000);
    await expect(system.interpretation.processNext.execute()).rejects.toThrow('offline');
    expect(await status(system, entryId)).toMatchObject({
      attempts: 2,
      availableAt: '2026-08-09T12:00:04.000Z',
    });
    vi.advanceTimersByTime(3_000);
    await expect(system.interpretation.processNext.execute()).rejects.toThrow('offline');
    expect(await status(system, entryId)).toMatchObject({ status: 'exhausted', attempts: 3 });
    await system.close();
  });

  it('uses provider quota timing as a lower bound and retries invalid output briefly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-09T12:00:00.000Z');
    const quota = createTestSystem({
      adapter: new FailingAdapter(() => new RetryableInferenceError('quota', 'limited', 5_000)),
      processing,
    });
    const quotaEntry = await capture(quota);
    await expect(quota.interpretation.processNext.execute()).rejects.toThrow('limited');
    expect(await status(quota, quotaEntry)).toMatchObject({
      attempts: 1,
      availableAt: '2026-08-09T12:00:05.000Z',
    });
    await quota.close();

    const invalid = createTestSystem({ adapter: new InvalidAdapter(), processing });
    const invalidEntry = await capture(invalid);
    await expect(invalid.interpretation.processNext.execute()).rejects.toThrow(
      'Synthetic invalid output',
    );
    expect(await status(invalid, invalidEntry)).toMatchObject({
      attempts: 1,
      availableAt: '2026-08-09T12:00:00.100Z',
    });
    await invalid.close();
  });

  it('fails authentication errors immediately without fallback', async () => {
    const adapter = new FailingAdapter(
      () => new InferenceAdapterError('authentication', 'invalid credentials'),
    );
    const system = createTestSystem({ adapter, processing });
    const entryId = await capture(system);

    await expect(system.interpretation.processNext.execute()).rejects.toThrow(
      'invalid credentials',
    );
    expect(await status(system, entryId)).toMatchObject({ status: 'failed', attempts: 1 });
    expect(adapter.calls).toBe(1);
    await system.close();
  });
});

class FailingAdapter {
  readonly identity = Object.freeze({ key: 'failing' });
  calls = 0;
  constructor(private readonly error: () => Error) {}
  async interpret(): Promise<never> {
    this.calls += 1;
    throw this.error();
  }
}

class InvalidAdapter {
  readonly identity = Object.freeze({ key: 'invalid' });
  async interpret(_request: InterpretationRequest) {
    return { kind: 'invalid' as const, reason: 'Synthetic invalid output' };
  }
}

async function capture(system: ReturnType<typeof createTestSystem>): Promise<string> {
  return system.capture.captureEntry.execute({
    content: { kind: 'text', text: 'Interpreta esto.' },
    origin: { source: 'test' },
  });
}

async function status(system: ReturnType<typeof createTestSystem>, entryId: string) {
  return system.interpretation.getEntryStatus.execute(entryId);
}
