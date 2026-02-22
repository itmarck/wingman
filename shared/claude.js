import { spawn } from 'child_process';
import 'dotenv/config';
import { createLogger } from './logger.js';

const log = createLogger('clde');
const TIMEOUT_MS = 120_000;

export async function classify(prompt) {
  log.data(`Classify prompt (${prompt.length} chars):\n${prompt.slice(0, 500)}...`);
  const output = await runClaude(prompt);
  log.data(`Classify raw response:\n${output}`);
  return parseJSON(output);
}

export async function summarize(prompt) {
  log.data(`Summarize prompt (${prompt.length} chars):\n${prompt.slice(0, 500)}...`);
  const output = await runClaude(prompt);
  log.data(`Summarize raw response (${output.length} chars):\n${output.slice(0, 500)}...`);
  return output;
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
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
        log.data(`Claude CLI stderr: ${stderr.trim()}`);
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
    log.data(`Raw output: ${text.slice(0, 500)}`);
    throw err;
  }
}

// Standalone test
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  log.head('Testing Claude CLI integration...');
  const result = await classify(
    'Classify this test email and respond with JSON:\n\n' +
    '{"classification": "noise", "reason": "test email", "summary": "This is a test", "suggested_action": null, "draft_reply": null}\n\n' +
    'From: test@example.com\nSubject: Test email\nBody: This is a test email for Wingman.'
  );
  log.ok(`Classification result: ${JSON.stringify(result, null, 2)}`);
  log.ok('Claude CLI test passed');
}
