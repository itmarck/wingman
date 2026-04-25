import { createLogger } from '../logger.js';
import type { ClassificationResult, RawResult } from './types.js';

const log = createLogger('clde');

/**
 * Extract JSON from a model response. Handles ```json fences and bare JSON.
 * Throws on parse failure.
 */
export function extractJSON(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Failed to parse model response as JSON: ${msg}`);
    log.verb(`Raw output: ${text.slice(0, 500)}`);
    throw err instanceof Error ? err : new Error(msg);
  }
}

export function parseClassification(text: string): ClassificationResult {
  const parsed = extractJSON(text) as ClassificationResult;
  if (!parsed || typeof parsed !== 'object' || !parsed.classification) {
    throw new Error('Missing "classification" field in response');
  }
  return parsed;
}

export function parseRaw(text: string): RawResult {
  const parsed = extractJSON(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Model response is not a JSON object');
  }
  return parsed as RawResult;
}
