import { createLogger } from '../../shared/logger.js';

const log = createLogger('mail');

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

  log.verb(`Token refresh request → tenant: ${TENANT_ID}, client: ${CLIENT_ID.slice(0, 8)}...`);

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
    log.verb(`Token refresh response (${res.status}): ${text}`);
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  const rotated = !!data.refresh_token;
  if (data.refresh_token) {
    currentRefreshToken = data.refresh_token;
  }

  log.verb(`Token refresh OK — expires_in: ${data.expires_in}s, refresh_token rotated: ${rotated}`);

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
  log.verb(`Graph API request: GET ${url}`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    log.verb(`Graph API response (${res.status}): ${text}`);
    throw new Error(`Graph API /me/messages failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  log.ok(`Fetched ${data.value.length} emails from the last ${lookbackHours}h`);

  // Log each email as data (visible list of what was fetched)
  for (const email of data.value) {
    const from = email.from?.emailAddress?.address || 'unknown';
    const readStatus = email.isRead ? 'read' : 'unread';
    log.data(`"${email.subject}" from ${from} [${readStatus}]`, null, 1);
  }

  return data.value;
}

export async function fetchUnreadToday(accessToken, { includeJunk = false } = {}) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const since = todayStart.toISOString();

  const folders = [{ name: 'inbox', path: '/me/mailFolders/inbox/messages' }];
  if (includeJunk) {
    // Try to find the junk folder ID dynamically
    const junkPath = await resolveJunkFolder(accessToken);
    if (junkPath) {
      folders.push({ name: 'junk', path: junkPath });
    }
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
    log.verb(`Graph API request (${folder.name}): GET ${url}`);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      log.verb(`Graph API response (${res.status}): ${text}`);
      log.warn(`Failed to fetch ${folder.name} (${res.status}), skipping`);
      continue;
    }

    const data = await res.json();
    const tagged = data.value.map((e) => ({ ...e, _folder: folder.name }));
    allEmails.push(...tagged);

    log.info(`Fetched ${data.value.length} unread emails from ${folder.name} (today)`);

    for (const email of data.value) {
      const from = email.from?.emailAddress?.address || 'unknown';
      log.data(`[${folder.name}] "${email.subject}" from ${from}`, null, 1);
    }
  }

  return allEmails;
}

async function resolveJunkFolder(accessToken) {
  // List mail folders and find junk/spam by wellKnownName or displayName
  const url = `${GRAPH_URL}/me/mailFolders?$select=id,displayName&$top=50`;
  log.verb(`Resolving junk folder: GET ${url}`);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      log.warn(`Failed to list mail folders (${res.status}), skipping junk`);
      return null;
    }

    const data = await res.json();
    const junkNames = ['junk email', 'junk', 'spam', 'correo no deseado', 'correo electrónico no deseado'];
    const junkFolder = data.value.find((f) =>
      junkNames.includes(f.displayName.toLowerCase())
    );

    if (junkFolder) {
      log.info(`Found junk folder: "${junkFolder.displayName}" (${junkFolder.id.slice(0, 20)}...)`);
      return `/me/mailFolders/${junkFolder.id}/messages`;
    }

    log.verb(`Available folders: ${data.value.map((f) => f.displayName).join(', ')}`);
    log.warn('Junk/spam folder not found, skipping');
    return null;
  } catch (err) {
    log.warn(`Error resolving junk folder: ${err.message}`);
    return null;
  }
}

export async function moveToInbox(accessToken, messageId) {
  log.verb(`POST /me/messages/${messageId.slice(0, 20)}... /move → inbox`);

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
    log.verb(`moveToInbox response (${res.status}): ${text}`);
    throw new Error(`moveToInbox failed (${res.status}): ${text}`);
  }

  log.verb(`moveToInbox OK (${res.status})`);
}

export async function markAsRead(accessToken, messageId) {
  log.verb(`PATCH /me/messages/${messageId.slice(0, 20)}... → isRead: true`);

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
    log.verb(`markAsRead response (${res.status}): ${text}`);
    throw new Error(`markAsRead failed (${res.status}): ${text}`);
  }

  log.verb(`markAsRead OK (${res.status})`);
}

export async function archiveEmail(accessToken, messageId) {
  log.verb(`POST /me/messages/${messageId.slice(0, 20)}... /move → archive`);

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
    log.verb(`archiveEmail response (${res.status}): ${text}`);
    throw new Error(`archiveEmail failed (${res.status}): ${text}`);
  }

  log.verb(`archiveEmail OK (${res.status})`);
}

export async function moveToTrash(accessToken, messageId) {
  log.verb(`POST /me/messages/${messageId.slice(0, 20)}... /move → deleteditems`);

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
    log.verb(`moveToTrash response (${res.status}): ${text}`);
    throw new Error(`moveToTrash failed (${res.status}): ${text}`);
  }

  log.verb(`moveToTrash OK (${res.status})`);
}
