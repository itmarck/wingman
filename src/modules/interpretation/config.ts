export interface ProcessingConfig {
  readonly leaseDurationMs: number;
  readonly leaseRenewalIntervalMs: number;
  readonly pollingIntervalMs: number;
  readonly retryDelaysMs: Readonly<Record<InferenceRetryClass, readonly number[]>>;
}

export type InferenceRetryClass = 'transient' | 'quota' | 'invalidResponse';

/**
 * Central processing defaults. Callers may replace the complete configuration at composition time.
 */
export const defaultProcessingConfig: ProcessingConfig = Object.freeze({
  leaseDurationMs: 5 * 60_000,
  leaseRenewalIntervalMs: 60_000,
  pollingIntervalMs: 250,
  retryDelaysMs: Object.freeze({
    transient: Object.freeze([60_000, 5 * 60_000]),
    quota: Object.freeze([15 * 60_000, 60 * 60_000]),
    invalidResponse: Object.freeze([10_000, 60_000]),
  }),
});

/**
 * Rejects timing combinations that would make leases or scheduling unreliable.
 */
export function assertProcessingConfig(config: ProcessingConfig): void {
  assertPositive(config.leaseDurationMs, 'Processing leaseDurationMs');
  assertPositive(config.leaseRenewalIntervalMs, 'Processing leaseRenewalIntervalMs');
  assertPositive(config.pollingIntervalMs, 'Processing pollingIntervalMs');

  if (config.leaseRenewalIntervalMs >= config.leaseDurationMs) {
    throw new Error('Processing lease renewal must occur before the lease expires');
  }

  for (const retryClass of ['transient', 'quota', 'invalidResponse'] as const) {
    const delays = config.retryDelaysMs[retryClass];
    if (delays.length > 2)
      throw new Error(`Processing ${retryClass} retries exceed three total attempts`);
    for (const [index, delay] of delays.entries()) {
      if (!Number.isFinite(delay) || delay < 0)
        throw new Error('Processing retry delays must be finite non-negative values');
      if (index > 0 && delay <= (delays[index - 1] ?? delay))
        throw new Error(`Processing ${retryClass} retry delays must increase`);
    }
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive value`);
  }
}
