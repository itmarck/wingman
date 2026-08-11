export type ProviderErrorCategory =
  | 'authentication'
  | 'invalidResponse'
  | 'provider'
  | 'refusal'
  | 'request'
  | 'unavailable';

export type ProviderRetryClass = 'invalidResponse' | 'quota' | 'transient';

export class ProviderError extends Error {
  constructor(
    readonly category: ProviderErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class RetryableProviderError extends ProviderError {
  constructor(
    readonly retryClass: ProviderRetryClass,
    category: ProviderErrorCategory,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(category, message);
    this.name = 'RetryableProviderError';
  }
}
