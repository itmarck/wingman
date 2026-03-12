/**
 * Configuration management
 *
 * Three data sources, each with its own storage:
 *   - Secrets (MS_*, NOTION_*) → Windows: user env vars (setx) / Linux: state/secrets.json
 *   - Settings                 → state/settings.json
 *   - Slack webhooks           → state/slack.json
 *
 * loadConfig() populates process.env from JSON/state files at startup,
 * so existing agent code reads everything from process.env unchanged.
 */

import { readFileSync, writeFileSync, chmodSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS_FILE = resolve(ROOT, 'state/settings.json');
const SLACK_FILE = resolve(ROOT, 'state/slack.json');
const SECRETS_FILE = resolve(ROOT, 'state/secrets.json');

const IS_WIN = process.platform === 'win32';

const SLACK_MAP = {
  email_important: 'SLACK_WEBHOOK_EMAIL_IMPORTANT',
  email_digest: 'SLACK_WEBHOOK_EMAIL_DIGEST',
  news: 'SLACK_WEBHOOK_NEWS',
  logs: 'SLACK_WEBHOOK_LOGS',
  alerts: 'SLACK_WEBHOOK_ALERTS',
};

// ─── Helpers ─────────────────────────────────────────────────

function readJsonSync(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { return null; }
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return {}; }
}

async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2));
}

// ─── Startup loader (sync) ──────────────────────────────────

export function loadConfig() {
  // Secrets (Linux only — Windows has them in system env already)
  if (!IS_WIN) {
    const secrets = readJsonSync(SECRETS_FILE);
    if (secrets) {
      for (const [key, value] of Object.entries(secrets)) {
        process.env[key] = String(value);
      }
    }
  }

  // Settings → process.env
  const settings = readJsonSync(SETTINGS_FILE);
  if (settings) {
    for (const [key, value] of Object.entries(settings)) {
      process.env[key.toUpperCase()] = String(value);
    }
  }

  // Slack webhooks → process.env
  const slack = readJsonSync(SLACK_FILE);
  if (slack) {
    for (const [key, url] of Object.entries(slack)) {
      if (SLACK_MAP[key]) process.env[SLACK_MAP[key]] = url;
    }
  }
}

// ─── System env vars (secrets) ───────────────────────────────

export function setSystemEnv(key, value) {
  if (IS_WIN) {
    try {
      execSync(`setx ${key} "${value}"`, { windowsHide: true, stdio: 'pipe' });
    } catch {
      const b64 = Buffer.from(value).toString('base64');
      execSync(
        `powershell -NoProfile -Command "$v=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'));[Environment]::SetEnvironmentVariable('${key}',$v,'User')"`,
        { windowsHide: true, stdio: 'pipe' },
      );
    }
  } else {
    // Linux/Mac: persist in state/secrets.json (chmod 600)
    const secrets = readJsonSync(SECRETS_FILE) || {};
    secrets[key] = value;
    writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2));
    chmodSync(SECRETS_FILE, 0o600);
  }
  process.env[key] = value;
}

// ─── Settings (state/settings.json) ──────────────────────────

export async function readSettings() {
  return readJson(SETTINGS_FILE);
}

export async function writeSetting(key, value) {
  const data = await readSettings();
  data[key] = isNaN(Number(value)) ? value : Number(value);
  await writeJson(SETTINGS_FILE, data);
  process.env[key.toUpperCase()] = String(value);
}

// ─── Slack webhooks (state/slack.json) ───────────────────────

export async function readSlack() {
  return readJson(SLACK_FILE);
}

export async function writeSlack(key, url) {
  const data = await readSlack();
  data[key] = url;
  await writeJson(SLACK_FILE, data);
  if (SLACK_MAP[key]) process.env[SLACK_MAP[key]] = url;
}
