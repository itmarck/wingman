export interface AIOptions {
  effort?: 'low' | 'medium' | 'high';
  model?: string;
  /** JSON schema for structured outputs (only honored by providers that support it). */
  schema?: Record<string, unknown>;
}

/**
 * Email classification result. Strict shape with required `classification` field.
 * Other fields documented in CLAUDE.md.
 */
export interface ClassificationResult {
  classification: 'urgent' | 'important' | 'informational' | 'noise' | 'unknown';
  category?: string;
  reason?: string;
  summary?: string;
  amount?: number | null;
  amount_currency?: string | null;
  group_key?: string;
  email_action?: string;
  [key: string]: unknown;
}

/** Free-form JSON result (used by inbox task classifier and similar). */
export type RawResult = Record<string, unknown>;

export interface AIProvider {
  /** Returns parsed JSON. Validates that `classification` field exists. */
  classify(prompt: string, options?: AIOptions): Promise<ClassificationResult>;
  /** Returns parsed JSON without field validation. */
  classifyRaw(prompt: string, options?: AIOptions): Promise<RawResult>;
  /** Returns free-form text. */
  summarize(prompt: string, options?: AIOptions): Promise<string>;
  /** Provider name for logging. */
  readonly name: string;
}
