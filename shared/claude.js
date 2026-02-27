import { spawn } from 'child_process';
import 'dotenv/config';
import { createLogger } from './logger.js';

const log = createLogger('clde');
const TIMEOUT_MS = 120_000;

export async function classify(prompt) {
  log.verb(`Classify prompt (${prompt.length} chars):`);
  log.verb(prompt.slice(0, 500) + '...', 1);
  const output = await runClaude(prompt);
  const parsed = parseJSON(output);
  log.data('Classification result:', parsed);
  return parsed;
}

export async function summarize(prompt) {
  log.verb(`Summarize prompt (${prompt.length} chars):`);
  log.verb(prompt.slice(0, 500) + '...', 1);
  const output = await runClaude(prompt);
  log.data(`Summarize response (${output.length} chars):`);
  log.data(output.slice(0, 500) + (output.length > 500 ? '...' : ''), 1);
  return output;
}

/**
 * classifyRaw — parse JSON from Claude without field validation.
 * Used by agents whose schema differs from the email classifier.
 */
export async function classifyRaw(prompt) {
  log.verb(`ClassifyRaw prompt (${prompt.length} chars):`);
  log.verb(prompt.slice(0, 500) + '...', 1);
  const output = await runClaude(prompt);
  const parsed = parseJSONRaw(output);
  log.data('Classification result:', parsed);
  return parsed;
}

function parseJSONRaw(text) {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    log.error(`Failed to parse Claude response as JSON: ${err.message}`);
    log.verb(`Raw output: ${text.slice(0, 500)}`);
    throw err;
  }
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    // Strip Claude Code session variables so nested invocations aren't blocked.
    // Recent Claude Code versions refuse to launch inside an active session.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE'))
    );

    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
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
      if (stderr.trim()) {
        log.verb(`Claude CLI stderr: ${stderr.trim()}`);
      }
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

function parseJSON(text) {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    if (!parsed.classification) {
      throw new Error('Missing "classification" field in response');
    }

    return parsed;
  } catch (err) {
    log.error(`Failed to parse Claude response as JSON: ${err.message}`);
    log.verb(`Raw output: ${text.slice(0, 500)}`);
    throw err;
  }
}

// Standalone test
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  log.head('Testing Claude CLI integration...');
  const result = await classify(
    'Classify this email and respond with a JSON object containing at least a "classification" field.\n\n' +
    'From: test@example.com\nSubject: Test email\nBody: This is a test email for Wingman.'
  );
  log.ok(`Classification result: ${JSON.stringify(result, null, 2)}`);
  log.ok('Claude CLI test passed');
}
