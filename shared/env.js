/**
 * Configuration management
 *
 * Three data sources, each with its own storage:
 *   - Secrets (MS_*, NOTION_*) → state/secrets.json (chmod 600 on Linux)
 *   - Settings                 → state/settings.json
 *   - Slack webhooks           → state/slack.json
 *
 * loadConfig() populates process.env from JSON/state files at startup,
 * so existing agent code reads everything from process.env unchanged.
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS_FILE = resolve(ROOT, 'state/settings.json');
const SLACK_FILE = resolve(ROOT, 'state/slack.json');
const SECRETS_FILE = resolve(ROOT, 'state/secrets.json');

const IS_WIN = process.platform === 'win32';
const IS_LINUX = !IS_WIN;

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
  // Files only fill what env vars have not already provided.
  // This makes Railway/Docker env vars win over local state/*.json files.
  const setIfMissing = (key, value) => {
    if (process.env[key] === undefined) process.env[key] = String(value);
  };

  const secrets = readJsonSync(SECRETS_FILE);
  if (secrets) {
    for (const [key, value] of Object.entries(secrets)) setIfMissing(key, value);
  }

  const settings = readJsonSync(SETTINGS_FILE);
  if (settings) {
    for (const [key, value] of Object.entries(settings)) setIfMissing(key.toUpperCase(), value);
  }

  const slack = readJsonSync(SLACK_FILE);
  if (slack) {
    for (const [key, url] of Object.entries(slack)) {
      if (SLACK_MAP[key]) setIfMissing(SLACK_MAP[key], url);
    }
  }
}

// ─── Secrets (state/secrets.json) ────────────────────────────

export function setSystemEnv(key, value) {
  mkdirSync(resolve(ROOT, 'state'), { recursive: true });
  const secrets = readJsonSync(SECRETS_FILE) || {};
  secrets[key] = value;
  writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2));
  if (IS_LINUX) chmodSync(SECRETS_FILE, 0o600);
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
