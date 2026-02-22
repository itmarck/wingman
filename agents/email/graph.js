import { createLogger } from '../../shared/logger.js';

const log = createLogger('email');

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

  log.verbose(`Token refresh request → tenant: ${TENANT_ID}, client: ${CLIENT_ID.slice(0, 8)}...`);

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
    log.verbose(`Token refresh response (${res.status}): ${text}`);
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  const rotated = !!data.refresh_token;
  if (data.refresh_token) {
    currentRefreshToken = data.refresh_token;
  }

  log.verbose(`Token refresh OK — expires_in: ${data.expires_in}s, refresh_token rotated: ${rotated}`);

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
  log.verbose(`Graph API request: GET ${url}`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    log.verbose(`Graph API response (${res.status}): ${text}`);
    throw new Error(`Graph API /me/messages failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  log.info(`Fetched ${data.value.length} emails from the last ${lookbackHours}h`);

  // Log each email's metadata for debugging
  for (const email of data.value) {
    const from = email.from?.emailAddress?.address || 'unknown';
    log.verbose(`  Email: "${email.subject}" from ${from} | isRead: ${email.isRead} | id: ${email.id.slice(0, 20)}...`);
  }

  return data.value;
}

export async function fetchUnreadToday(accessToken, { includeJunk = false } = {}) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const since = todayStart.toISOString();

  const folders = [{ name: 'inbox', path: '/me/messages' }];
  if (includeJunk) {
    folders.push({ name: 'junk', path: '/me/mailFolders/junkemail/messages' });
  }

  const allEmails = [];

  for (const folder of folders) {
    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${since} and isRead eq false`,
      $select: 'id,subject,from,receivedDateTime,bodyPreview,body,isRead,parentFolderId',
      $top: '100',
      $orderby: 'receivedDateTime desc',
    });

    const url = `${GRAPH_URL}${folder.path}?${params}`;
    log.verbose(`Graph API request (${folder.name}): GET ${url}`);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      log.verbose(`Graph API response (${res.status}): ${text}`);
      log.warn(`Failed to fetch ${folder.name} (${res.status}), skipping`);
      continue;
    }

    const data = await res.json();
    const tagged = data.value.map((e) => ({ ...e, _folder: folder.name }));
    allEmails.push(...tagged);

    log.info(`Fetched ${data.value.length} unread emails from ${folder.name} (today)`);
  }

  return allEmails;
}

export async function moveToInbox(accessToken, messageId) {
  log.verbose(`POST /me/messages/${messageId.slice(0, 20)}... /move → inbox`);

  const res = await fetch(`${GRAPH_URL}/me/messages/${messageId}/move`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ destinationId: 'inbox' }),
  });

  if (!res.ok) {
    const text = await res.text();
    log.verbose(`moveToInbox response (${res.status}): ${text}`);
    throw new Error(`moveToInbox failed (${res.status}): ${text}`);
  }

  log.verbose(`moveToInbox OK (${res.status})`);
}

export async function markAsRead(accessToken, messageId) {
  log.verbose(`PATCH /me/messages/${messageId.slice(0, 20)}... → isRead: true`);

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
    log.verbose(`markAsRead response (${res.status}): ${text}`);
    throw new Error(`markAsRead failed (${res.status}): ${text}`);
  }

  log.verbose(`markAsRead OK (${res.status})`);
}

export async function archiveEmail(accessToken, messageId) {
  log.verbose(`POST /me/messages/${messageId.slice(0, 20)}... /move → archive`);

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
    log.verbose(`archiveEmail response (${res.status}): ${text}`);
    throw new Error(`archiveEmail failed (${res.status}): ${text}`);
  }

  log.verbose(`archiveEmail OK (${res.status})`);
}

export async function moveToTrash(accessToken, messageId) {
  log.verbose(`POST /me/messages/${messageId.slice(0, 20)}... /move → deleteditems`);

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
    log.verbose(`moveToTrash response (${res.status}): ${text}`);
    throw new Error(`moveToTrash failed (${res.status}): ${text}`);
  }

  log.verbose(`moveToTrash OK (${res.status})`);
}
