/**
 * Microsoft OAuth 2.0 Device Code Flow
 *
 * Run once to obtain a refresh token:
 *   node agents/email/auth.js
 *
 * Prerequisites:
 *   1. Register an app at https://portal.azure.com → App registrations
 *   2. Set "Mobile and desktop applications" redirect URI to https://login.microsoftonline.com/common/oauth2/nativeclient
 *   3. Enable "Allow public client flows" under Authentication
 *   4. Add MS_CLIENT_ID and MS_TENANT_ID to your .env
 */

import 'dotenv/config';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('email-auth');

const CLIENT_ID = process.env.MS_CLIENT_ID;
const TENANT_ID = process.env.MS_TENANT_ID || 'consumers';
const SCOPES = 'Mail.Read offline_access';

const DEVICE_CODE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/devicecode`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

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
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
  });

  while (true) {
    await new Promise((r) => setTimeout(r, interval * 1000));

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });

    const data = await res.json();

    if (data.access_token) {
      return data;
    }

    if (data.error === 'authorization_pending') {
      // User hasn't completed auth yet, keep polling
      continue;
    }

    if (data.error === 'slow_down') {
      interval += 5;
      continue;
    }

    // expired_token, authorization_declined, bad_verification_code, etc.
    throw new Error(`Token request failed: ${data.error} — ${data.error_description}`);
  }
}

async function main() {
  if (!CLIENT_ID) {
    log.error('MS_CLIENT_ID is not set in .env');
    log.error('Register an app at https://portal.azure.com → App registrations');
    process.exit(1);
  }

  log.info('Starting Microsoft OAuth device code flow...');
  log.info(`Tenant: ${TENANT_ID}`);
  log.info(`Scopes: ${SCOPES}`);

  const codeResponse = await requestDeviceCode();

  console.log('\n' + '='.repeat(60));
  console.log('  To sign in, open this URL in your browser:');
  console.log(`  ${codeResponse.verification_uri}`);
  console.log();
  console.log(`  Enter this code: ${codeResponse.user_code}`);
  console.log('='.repeat(60) + '\n');

  log.info('Waiting for you to complete authentication...');

  const tokenResponse = await pollForToken(
    codeResponse.device_code,
    codeResponse.interval || 5,
  );

  console.log('\n' + '='.repeat(60));
  console.log('  Authentication successful!');
  console.log();
  console.log('  Add this to your .env file:');
  console.log(`  MS_REFRESH_TOKEN=${tokenResponse.refresh_token}`);
  console.log('='.repeat(60) + '\n');

  log.info('Done. You can now run the email agent.');
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
