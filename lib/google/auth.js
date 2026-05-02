/**
 * Google OAuth 2.0 — refresh-token-based access token retrieval.
 *
 * Scope-agnostic: works with any Google API. Whatever scopes were granted
 * during the device-code auth flow are inherited via the refresh token.
 *
 * Env required:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET   (optional — required for "Web" / "Desktop" client types)
 *   GOOGLE_REFRESH_TOKEN   (obtained via `npm run dev -- google-auth`)
 */

import { createLogger } from '../logger.js';

const log = createLogger('goog');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cachedToken = null;
let tokenExpiresAt = 0;

export async function getAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !refreshToken) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_REFRESH_TOKEN must be set. Run: npm run dev -- google-auth',
    );
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  log.verb(`Token refresh request → client: ${clientId.slice(0, 12)}...`);

  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  if (clientSecret) params.set('client_secret', clientSecret);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    log.verb(`Token refresh response (${res.status}): ${text}`);
    throw new Error(`Google token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  log.verb(`Google token refreshed — expires_in: ${data.expires_in}s`);
  return cachedToken;
}

/**
 * Wrapper around fetch() that automatically attaches a Google access token.
 * Used by all Google API modules (calendar, drive, etc.) to share auth logic.
 */
export async function googleFetch(url, options = {}) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.verb(`${options.method || 'GET'} ${url} → ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`Google API ${res.status} (${url.split('?')[0]}): ${text.slice(0, 200)}`);
  }

  return res;
}
