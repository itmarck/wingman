export interface ProcessingConfig {
  readonly leaseDurationMs: number;
  readonly leaseRenewalIntervalMs: number;
  readonly pollingIntervalMs: number;
  readonly retryDelaysMs: readonly number[];
}

/**
 * Central processing defaults. Callers may replace the complete configuration at composition time.
 */
export const defaultProcessingConfig: ProcessingConfig = Object.freeze({
  leaseDurationMs: 5 * 60_000,
  leaseRenewalIntervalMs: 60_000,
  pollingIntervalMs: 250,
  retryDelaysMs: Object.freeze([60_000, 3 * 60_000]),
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

  for (const delay of config.retryDelaysMs) {
    if (!Number.isFinite(delay) || delay < 0) {
      throw new Error('Processing retry delays must be finite non-negative values');
    }
  }
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive value`);
  }
}
