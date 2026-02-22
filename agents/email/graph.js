import { createLogger } from '../../shared/logger.js';

const log = createLogger('email-agent');

const TENANT_ID = process.env.MS_TENANT_ID || 'consumers';
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
const GRAPH_URL = 'https://graph.microsoft.com/v1.0';

let currentRefreshToken = process.env.MS_REFRESH_TOKEN;

export async function getAccessToken() {
  if (!CLIENT_ID || !currentRefreshToken) {
    throw new Error('MS_CLIENT_ID and MS_REFRESH_TOKEN must be set. Run: node agents/email/auth.js');
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: currentRefreshToken,
    scope: 'Mail.ReadWrite offline_access',
  });

  if (CLIENT_SECRET) {
    params.set('client_secret', CLIENT_SECRET);
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  if (data.refresh_token) {
    currentRefreshToken = data.refresh_token;
  }

  return data.access_token;
}

export async function fetchEmails(accessToken, lookbackHours = 1) {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${since}`,
    $select: 'id,subject,from,receivedDateTime,bodyPreview,body,isRead',
    $top: '50',
    $orderby: 'receivedDateTime desc',
  });

  const url = `${GRAPH_URL}/me/messages?${params}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API /me/messages failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  log.info(`Fetched ${data.value.length} emails from the last ${lookbackHours}h`);
  return data.value;
}

export async function markAsRead(accessToken, messageId) {
  const res = await fetch(`${GRAPH_URL}/me/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isRead: true }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`markAsRead failed (${res.status}): ${text}`);
  }
}

export async function archiveEmail(accessToken, messageId) {
  // Move to Archive folder. Graph uses the well-known folder name "archive".
  const res = await fetch(`${GRAPH_URL}/me/messages/${messageId}/move`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ destinationId: 'archive' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`archiveEmail failed (${res.status}): ${text}`);
  }
}

export async function moveToTrash(accessToken, messageId) {
  // Move to Deleted Items folder
  const res = await fetch(`${GRAPH_URL}/me/messages/${messageId}/move`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ destinationId: 'deleteditems' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`moveToTrash failed (${res.status}): ${text}`);
  }
}
