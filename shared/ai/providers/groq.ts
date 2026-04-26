import { createLogger } from '../../logger.js';
import { parseClassification, parseRaw } from '../parse.js';
import type { AIOptions, AIProvider, ClassificationResult, RawResult } from '../types.js';

const log = createLogger('groq');

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 60_000;

interface GroqRequest {
  model: string;
  messages: Array<{ role: 'user' | 'system'; content: string }>;
  temperature?: number;
  response_format?: { type: 'json_object' };
}

interface GroqResponse {
  choices: Array<{ message: { content: string } }>;
}

/**
 * Groq provider — OpenAI-compatible API. Free tier covers our volume.
 * Uses `response_format: json_object` for structured calls.
 */
export class GroqProvider implements AIProvider {
  readonly name = 'groq';

  async classify(prompt: string, options: AIOptions = {}): Promise<ClassificationResult> {
    log.verb(`classify (${prompt.length} chars)`);
    const text = await runGroq(prompt, options, /* json */ true);
    const parsed = parseClassification(text);
    log.data('classify →', parsed);
    return parsed;
  }

  async classifyRaw(prompt: string, options: AIOptions = {}): Promise<RawResult> {
    log.verb(`classifyRaw (${prompt.length} chars)`);
    const text = await runGroq(prompt, options, /* json */ true);
    const parsed = parseRaw(text);
    log.data('classifyRaw →', parsed);
    return parsed;
  }

  async summarize(prompt: string, options: AIOptions = {}): Promise<string> {
    log.verb(`summarize (${prompt.length} chars)`);
    const text = await runGroq(prompt, options, /* json */ false);
    log.data(`summarize response (${text.length} chars):`);
    log.data(text.slice(0, 500), null, 1);
    return text;
  }
}

async function runGroq(prompt: string, options: AIOptions, json: boolean): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const body: GroqRequest = {
    model: options.model || DEFAULT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  };
  if (json) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = (await res.json()) as GroqResponse;
    return (data.choices?.[0]?.message?.content || '').trim();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Groq request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
