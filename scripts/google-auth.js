#!/usr/bin/env node

/**
 * Google OAuth 2.0 Device Authorization flow.
 *
 * Run once locally:
 *   npm run dev -- google-auth
 *
 * Prerequisites:
 *   1. Create a Google Cloud project: https://console.cloud.google.com
 *   2. Enable the APIs you want (Calendar API, Drive API, etc.)
 *   3. APIs & Services → Credentials → Create Credentials → OAuth client ID
 *      → Application type: "TVs and Limited Input devices"
 *   4. Add the resulting CLIENT_ID and (if shown) CLIENT_SECRET to your environment:
 *        GOOGLE_CLIENT_ID=...
 *        GOOGLE_CLIENT_SECRET=...   (only if Google requires it for your client type)
 *   5. Add yourself as a test user in OAuth consent screen (App is "External" in Testing mode)
 *
 * After running, paste the printed GOOGLE_REFRESH_TOKEN into Railway / .env.
 *
 * Scopes: edit `SCOPES` below to whatever your Google APIs need.
 *   Calendar (read+write events): https://www.googleapis.com/auth/calendar.events
 *   Calendar (full):              https://www.googleapis.com/auth/calendar
 *   Drive (read-only):            https://www.googleapis.com/auth/drive.readonly
 *   Drive (file-level access):    https://www.googleapis.com/auth/drive.file
 */

import { loadConfig } from '../shared/env.js';
import { createLogger } from '../shared/logger.js';

loadConfig();

const log = createLogger('auth');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  // add more here as needed:
  // 'https://www.googleapis.com/auth/drive.file',
].join(' ');

const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function requestDeviceCode() {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPES }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Device code request failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function pollForToken(deviceCode, interval) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });
  if (CLIENT_SECRET) params.set('client_secret', CLIENT_SECRET);

  while (true) {
    await new Promise((r) => setTimeout(r, interval * 1000));

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const data = await res.json();

    if (data.access_token) return data;

    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      interval += 5;
      continue;
    }

    throw new Error(`Token request failed: ${data.error} — ${data.error_description || ''}`);
  }
}

async function main() {
  if (!CLIENT_ID) {
    log.error('GOOGLE_CLIENT_ID is not set.');
    log.error('Create OAuth credentials at https://console.cloud.google.com → APIs & Services → Credentials');
    log.error('Application type: "TVs and Limited Input devices"');
    process.exit(1);
  }

  log.head('Google OAuth device authorization flow');
  log.info(`Scopes: ${SCOPES}`);

  const codeResponse = await requestDeviceCode();

  console.log('\n' + '='.repeat(60));
  console.log('  Open this URL in your browser:');
  console.log(`  ${codeResponse.verification_url}`);
  console.log();
  console.log(`  Enter this code: ${codeResponse.user_code}`);
  console.log('='.repeat(60) + '\n');

  log.info(`Waiting for authorization (expires in ${codeResponse.expires_in}s)...`);

  const tokenResponse = await pollForToken(
    codeResponse.device_code,
    codeResponse.interval || 5,
  );

  if (!tokenResponse.refresh_token) {
    log.error('No refresh_token returned. Make sure your OAuth client is "TVs and Limited Input devices".');
    log.error('Full response:');
    console.log(tokenResponse);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('  Authorization successful!');
  console.log();
  console.log('  Add this to your environment (Railway / .env):');
  console.log(`  GOOGLE_REFRESH_TOKEN=${tokenResponse.refresh_token}`);
  console.log('='.repeat(60) + '\n');

  log.ok('Done.');
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
