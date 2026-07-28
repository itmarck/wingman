export const inferenceTargetKeys = ['openai.luna', 'groq.gptoss'] as const;

export type InferenceTargetKey = (typeof inferenceTargetKeys)[number];
export type InferenceProvider = 'groq' | 'openai';

export interface InferenceTarget {
  readonly key: InferenceTargetKey;
  readonly provider: InferenceProvider;
  readonly model: string;
}

const targets: Readonly<Record<InferenceTargetKey, InferenceTarget>> = Object.freeze({
  'openai.luna': Object.freeze({
    key: 'openai.luna',
    provider: 'openai',
    model: 'gpt-5.6-luna',
  }),
  'groq.gptoss': Object.freeze({
    key: 'groq.gptoss',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
  }),
});

/**
 * Resolves one known deployment target to its provider and concrete model.
 */
export function resolveInferenceTarget(value: string): InferenceTarget {
  if (!inferenceTargetKeys.includes(value as InferenceTargetKey)) {
    throw new Error(`Unsupported INFERENCE_TARGET: ${value}`);
  }

  return targets[value as InferenceTargetKey];
}
