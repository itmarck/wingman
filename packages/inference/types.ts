export type InferenceProtocol = 'chatCompletions' | 'responses';

export interface InferenceClientConfig {
  readonly apiKey: string;
  readonly endpoint: string;
  readonly model: string;
  readonly protocol: InferenceProtocol;
  readonly timeoutMs?: number;
}

export interface StructuredInferenceRequest {
  readonly instructions: string;
  readonly input: string;
  readonly reasoning: 'low' | 'high';
  readonly schema: object;
  readonly schemaName: string;
}

export interface ProviderExecution {
  readonly output: unknown;
  readonly usedModel?: string;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
}
