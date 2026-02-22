import 'dotenv/config';
import { readFile } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { classify } from '../../shared/claude.js';
import { sendSlack, formatEmailGroup } from '../../shared/slack.js';
import { getAccessToken, fetchEmails, fetchUnreadToday, markAsRead, archiveEmail, moveToTrash, moveToInbox } from './graph.js';
import { loadSeen, saveSeen } from './state.js';

const log = createLogger('mail');

const WEBHOOK_IMPORTANT = process.env.SLACK_WEBHOOK_EMAIL_IMPORTANT;
const WEBHOOK_DIGEST = process.env.SLACK_WEBHOOK_EMAIL_DIGEST;
const WEBHOOK_LOGS = process.env.SLACK_WEBHOOK_LOGS;
const LOOKBACK_HOURS = parseInt(process.env.EMAIL_LOOKBACK_HOURS || '1', 10);

async function loadProfile() {
  return readFile('config/profile.md', 'utf-8');
}

function buildPrompt(profile, email) {
  const from = email.from?.emailAddress?.address || 'unknown';
  const name = email.from?.emailAddress?.name || '';
  const body = email.bodyPreview || email.body?.content?.slice(0, 2000) || '';

  return [
    profile,
    '',
    '---',
    '',
    'Classify the following email. Respond ONLY with the JSON object, no extra text.',
    '',
    `From: ${name} <${from}>`,
    `Subject: ${email.subject || '(no subject)'}`,
    `Date: ${email.receivedDateTime}`,
    '',
    'Body:',
    body,
  ].join('\n');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'justo ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

async function executeAction(accessToken, emailId, action) {
  switch (action) {
    case 'read':
      await markAsRead(accessToken, emailId);
      break;
    case 'archive':
      await markAsRead(accessToken, emailId);
      await archiveEmail(accessToken, emailId);
      break;
    case 'trash':
      await moveToTrash(accessToken, emailId);
      break;
    case 'none':
    default:
      break;
  }
}

export async function runEmailAgent() {
  log.head(`Email cycle (lookback: ${LOOKBACK_HOURS}h)`);

  const accessToken = await getAccessToken();
  const emails = await fetchEmails(accessToken, LOOKBACK_HOURS);

  if (emails.length === 0) {
    log.info('No emails in lookback window');
    return { summary: 'email: 0 new' };
  }

  const seen = await loadSeen();
  log.verb(`Seen state loaded: ${seen.size} IDs tracked`);

  let skippedRead = 0;
  let skippedSeen = 0;
  const unseen = emails.filter((e) => {
    if (seen.has(e.id)) {
      skippedSeen++;
      return false;
    }
    if (e.isRead) {
      seen.add(e.id);
      skippedRead++;
      log.verb(`Skipped (already read in Outlook): "${e.subject}"`, 1);
      return false;
    }
    return true;
  });

  log.info(`Filter: ${unseen.length} new, ${skippedRead} read in Outlook, ${skippedSeen} already processed`);

  if (unseen.length === 0) {
    log.info('All emails already read or processed');
    await saveSeen(seen);
    return { summary: 'email: 0 new' };
  }

  const profile = await loadProfile();
  const classified = [];
  const counts = { urgent: 0, important: 0, informational: 0, noise: 0, error: 0 };

  for (const email of unseen) {
    try {
      const from = email.from?.emailAddress?.address || 'unknown';
      const fromName = email.from?.emailAddress?.name || from;

      const result = await classify(buildPrompt(profile, email));
      seen.add(email.id);
      counts[result.classification]++;
      classified.push({ email, classification: result });

      // Visible one-liner per email with classification result
      log.info(`"${email.subject}" from ${fromName} -- ${result.classification} [${result.email_action || 'none'}]`, 1);
      // Full classification JSON as data
      log.data(`Classification for "${email.subject}":`, result, 1);
    } catch (err) {
      counts.error++;
      seen.add(email.id);
      log.error(`Failed to process "${email.subject}": ${err.message}`);
    }
  }

  for (const { email, classification } of classified) {
    const action = classification.email_action || 'none';
    if (action === 'none') continue;

    try {
      await executeAction(accessToken, email.id, action);
      log.ok(`Action "${action}" on: "${email.subject}"`, 1);
    } catch (err) {
      log.error(`Failed action "${action}" on "${email.subject}": ${err.message}`);
    }
  }

  const slackWorthy = classified.filter((c) => c.classification.classification !== 'noise');
  log.info(`Slack: ${slackWorthy.length} to notify, ${classified.length - slackWorthy.length} noise filtered`);

  if (slackWorthy.length > 0) {
    const groups = new Map();

    for (const item of slackWorthy) {
      const key = `${item.classification.classification}::${item.classification.group_key || item.email.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          classification: item.classification.classification,
          groupKey: item.classification.group_key,
          items: [],
        });
      }
      groups.get(key).items.push(item);
    }

    log.info(`Grouped into ${groups.size} Slack messages`);

    for (const [key, group] of groups) {
      try {
        const webhook = group.classification === 'urgent' ? WEBHOOK_IMPORTANT : WEBHOOK_DIGEST;
        const payload = formatEmailGroup(group, timeAgo);
        log.verb(`Sending group "${key}" (${group.items.length} emails) to ${group.classification === 'urgent' ? '#email-important' : '#email-digest'}`, 1);
        await sendSlack(webhook, payload);
      } catch (err) {
        log.error(`Failed to send Slack notification: ${err.message}`);
      }
    }
  }

  await saveSeen(seen);

  const parts = [];
  if (counts.urgent > 0) parts.push(`${counts.urgent} urg`);
  if (counts.important > 0) parts.push(`${counts.important} imp`);
  if (counts.informational > 0) parts.push(`${counts.informational} info`);
  if (counts.noise > 0) parts.push(`${counts.noise} noise`);
  if (counts.error > 0) parts.push(`${counts.error} err`);

  const summaryText = `email: ${unseen.length} new (${parts.join(', ')})`;
  log.ok(`Cycle done: ${emails.length} fetched, ${unseen.length} new — ${parts.join(', ')}`);

  if (unseen.length > 0) {
    try {
      await sendSlack(WEBHOOK_LOGS, `[email-agent] ${summaryText}`);
    } catch {
      // Don't fail the cycle over a log notification
    }
  }

  return { summary: summaryText };
}

export async function runEmailCatchup() {
  log.head('Catch-up scan (all unread today, inbox + junk)');

  const accessToken = await getAccessToken();
  const emails = await fetchUnreadToday(accessToken, { includeJunk: true });

  if (emails.length === 0) {
    log.info('No unread emails today. All caught up!');
    return { summary: 'catchup: 0 unread' };
  }

  const seen = await loadSeen();
  const unseen = emails.filter((e) => !seen.has(e.id));

  const inboxCount = unseen.filter((e) => e._folder === 'inbox').length;
  const junkCount = unseen.filter((e) => e._folder === 'junk').length;

  log.info(`Catch-up: ${unseen.length} unprocessed (${inboxCount} inbox, ${junkCount} junk), ${emails.length - unseen.length} already processed`);

  if (unseen.length === 0) {
    log.info('All unread emails already processed');
    return { summary: 'catchup: 0 unprocessed' };
  }

  const profile = await loadProfile();
  const classified = [];
  const counts = { urgent: 0, important: 0, informational: 0, noise: 0, error: 0 };

  for (const email of unseen) {
    try {
      const from = email.from?.emailAddress?.address || 'unknown';
      const fromName = email.from?.emailAddress?.name || from;
      const folderTag = email._folder === 'junk' ? ' [JUNK]' : '';

      const result = await classify(buildPrompt(profile, email));
      seen.add(email.id);
      counts[result.classification]++;
      classified.push({ email, classification: result });

      log.info(`"${email.subject}" from ${fromName}${folderTag} -- ${result.classification} [${result.email_action || 'none'}]`, 1);
      log.data(`Classification for "${email.subject}":`, result, 1);

      // Rescue: if a junk email is not noise, move it to inbox
      if (email._folder === 'junk' && result.classification !== 'noise') {
        try {
          await moveToInbox(accessToken, email.id);
          log.ok(`Rescued from junk: "${email.subject}"`, 1);
        } catch (err) {
          log.error(`Failed to rescue from junk: ${err.message}`);
        }
      }
    } catch (err) {
      counts.error++;
      seen.add(email.id);
      log.error(`Failed to process "${email.subject}": ${err.message}`);
    }
  }

  // Execute email actions
  for (const { email, classification } of classified) {
    const action = classification.email_action || 'none';
    if (action === 'none') continue;

    try {
      await executeAction(accessToken, email.id, action);
      log.ok(`Action "${action}" on: "${email.subject}"`, 1);
    } catch (err) {
      log.error(`Failed action "${action}" on "${email.subject}": ${err.message}`);
    }
  }

  // Notify via Slack
  const slackWorthy = classified.filter((c) => c.classification.classification !== 'noise');

  if (slackWorthy.length > 0) {
    const groups = new Map();

    for (const item of slackWorthy) {
      const key = `${item.classification.classification}::${item.classification.group_key || item.email.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          classification: item.classification.classification,
          groupKey: item.classification.group_key,
          items: [],
        });
      }
      groups.get(key).items.push(item);
    }

    log.info(`Grouped into ${groups.size} Slack messages`);

    for (const [, group] of groups) {
      try {
        const webhook = group.classification === 'urgent' ? WEBHOOK_IMPORTANT : WEBHOOK_DIGEST;
        const payload = formatEmailGroup(group, timeAgo);
        await sendSlack(webhook, payload);
      } catch (err) {
        log.error(`Failed to send Slack notification: ${err.message}`);
      }
    }
  }

  await saveSeen(seen);

  const parts = [];
  if (counts.urgent > 0) parts.push(`${counts.urgent} urg`);
  if (counts.important > 0) parts.push(`${counts.important} imp`);
  if (counts.informational > 0) parts.push(`${counts.informational} info`);
  if (counts.noise > 0) parts.push(`${counts.noise} noise`);
  if (counts.error > 0) parts.push(`${counts.error} err`);
  const rescued = classified.filter((c) => c.email._folder === 'junk' && c.classification.classification !== 'noise').length;
  if (rescued > 0) parts.push(`${rescued} rescued`);

  const summaryText = `catchup: ${unseen.length} processed (${parts.join(', ')})`;
  log.ok(`Catch-up done: ${unseen.length} processed — ${parts.join(', ')}`);

  try {
    await sendSlack(WEBHOOK_LOGS, `[catch-up] ${summaryText}`);
  } catch {
    // Don't fail over a log notification
  }

  return { summary: summaryText };
}

// Direct execution: npm run dev:email
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  runEmailAgent()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error(`Fatal error: ${err.message}`);
      process.exit(1);
    });
}
