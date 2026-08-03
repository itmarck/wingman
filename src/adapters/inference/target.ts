export const inferenceTargetKeys = ['openai.luna', 'groq.gptoss', 'gemini.flash'] as const;

export type InferenceTargetKey = (typeof inferenceTargetKeys)[number];
export type InferenceProvider = 'gemini' | 'groq' | 'openai';

export interface InferenceTarget {
  readonly key: InferenceTargetKey;
  readonly provider: InferenceProvider;
  readonly model: string;
  readonly endpoint: string;
}

const targets: Readonly<Record<InferenceTargetKey, InferenceTarget>> = Object.freeze({
  'openai.luna': Object.freeze({
    key: 'openai.luna',
    provider: 'openai',
    model: 'gpt-5.6-luna',
    endpoint: 'https://api.openai.com/v1/responses',
  }),
  'groq.gptoss': Object.freeze({
    key: 'groq.gptoss',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    endpoint: 'https://api.groq.com/openai/v1/responses',
  }),
  'gemini.flash': Object.freeze({
    key: 'gemini.flash',
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
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
