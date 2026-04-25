import { spawn } from 'child_process';
import { createLogger } from '../../logger.js';
import { parseClassification, parseRaw } from '../parse.js';
import type { AIOptions, AIProvider, ClassificationResult, RawResult } from '../types.js';

const log = createLogger('clde');
const TIMEOUT_MS = 120_000;

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';

  async classify(prompt: string, options: AIOptions = {}): Promise<ClassificationResult> {
    log.verb(`Classify prompt (${prompt.length} chars):`);
    log.verb(prompt.slice(0, 500) + '...', 1);
    const output = await runClaude(prompt, options);
    const parsed = parseClassification(output);
    log.data('Classification result:', parsed);
    return parsed;
  }

  async classifyRaw(prompt: string, options: AIOptions = {}): Promise<RawResult> {
    log.verb(`ClassifyRaw prompt (${prompt.length} chars):`);
    log.verb(prompt.slice(0, 500) + '...', 1);
    const output = await runClaude(prompt, options);
    const parsed = parseRaw(output);
    log.data('Classification result:', parsed);
    return parsed;
  }

  async summarize(prompt: string, options: AIOptions = {}): Promise<string> {
    log.verb(`Summarize prompt (${prompt.length} chars):`);
    log.verb(prompt.slice(0, 500) + '...', 1);
    const output = await runClaude(prompt, options);
    log.data(`Summarize response (${output.length} chars):`);
    log.data(output.slice(0, 500) + (output.length > 500 ? '...' : ''), null, 1);
    return output;
  }
}

function runClaude(prompt: string, options: AIOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    // Strip Claude Code session variables so nested invocations aren't blocked.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE')),
    );

    const args = ['-p', '--output-format', 'text'];
    if (options.effort) args.push('--effort', options.effort);
    if (options.model) args.push('--model', options.model);

    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
      env,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Claude CLI timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (stderr.trim()) log.verb(`Claude CLI stderr: ${stderr.trim()}`);
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.trim()}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
