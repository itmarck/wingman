import { createLogger } from '../../logger.js';
import { parseClassification, parseRaw } from '../parse.js';
import type { AIOptions, AIProvider, ClassificationResult, RawResult } from '../types.js';

const log = createLogger('ollm');

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct';
const TIMEOUT_MS = 120_000;

interface OllamaChatBody {
  model: string;
  messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>;
  stream: false;
  format?: 'json' | Record<string, unknown>;
  options?: { temperature?: number; num_ctx?: number };
}

interface OllamaChatResponse {
  message: { content: string };
  done: boolean;
}

/**
 * Local Ollama provider. Targets a Modelfile-loaded chat model.
 * Uses `format: 'json'` for structured calls — Ollama enforces valid JSON
 * but does not enforce schema, so callers still validate via parse.ts.
 */
export class LocalProvider implements AIProvider {
  readonly name = 'local';

  async classify(prompt: string, options: AIOptions = {}): Promise<ClassificationResult> {
    log.verb(`classify (${prompt.length} chars)`);
    const text = await runOllama(prompt, options, /* json */ true);
    const parsed = parseClassification(text);
    log.data('classify →', parsed);
    return parsed;
  }

  async classifyRaw(prompt: string, options: AIOptions = {}): Promise<RawResult> {
    log.verb(`classifyRaw (${prompt.length} chars)`);
    const text = await runOllama(prompt, options, /* json */ true);
    const parsed = parseRaw(text);
    log.data('classifyRaw →', parsed);
    return parsed;
  }

  async summarize(prompt: string, options: AIOptions = {}): Promise<string> {
    log.verb(`summarize (${prompt.length} chars)`);
    const text = await runOllama(prompt, options, /* json */ false);
    log.data(`summarize response (${text.length} chars):`);
    log.data(text.slice(0, 500), null, 1);
    return text;
  }
}

async function runOllama(prompt: string, options: AIOptions, json: boolean): Promise<string> {
  const body: OllamaChatBody = {
    model: options.model || DEFAULT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    options: { temperature: 0.2 },
  };
  if (json) body.format = options.schema || 'json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = (await res.json()) as OllamaChatResponse;
    return (data.message?.content || '').trim();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
