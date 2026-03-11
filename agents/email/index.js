import 'dotenv/config';
import { readFile } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { classify } from '../../shared/claude.js';
import { sendSlack, formatEmailDigest, formatUnknownEmails } from '../../shared/slack.js';
import { getAccessToken, fetchEmails, fetchUnreadRecent, markAsRead, archiveEmail, moveToTrash, moveToInbox, moveToFolder } from './graph.js';
import { loadSeen, saveSeen } from './state.js';

const log = createLogger('mail');

const WEBHOOK_IMPORTANT = process.env.SLACK_WEBHOOK_EMAIL_IMPORTANT;
const WEBHOOK_DIGEST = process.env.SLACK_WEBHOOK_EMAIL_DIGEST;
const WEBHOOK_LOGS = process.env.SLACK_WEBHOOK_LOGS;
const LOOKBACK_HOURS = parseInt(process.env.EMAIL_LOOKBACK_HOURS || '1', 10);

// Minimum amount in PEN to trigger a Slack notification for tickets
const TICKET_NOTIFY_THRESHOLD = 1000;

async function loadProfile() {
  return readFile('config/profile.md', 'utf-8');
}

function buildPrompt(profile, email) {
  const from = email.from?.emailAddress?.address || 'unknown';
  const name = email.from?.emailAddress?.name || '';
  const body = (email.bodyPreview || email.body?.content || '').slice(0, 500);

  return [
    profile,
    '',
    '---',
    '',
    `From: ${name} <${from}>`,
    `Subject: ${email.subject || '(no subject)'}`,
    `Date: ${email.receivedDateTime}`,
    '',
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

/**
 * Execute the email_action from classification.
 * Does NOT mark as read — that happens separately after all actions.
 */
async function executeAction(accessToken, emailId, action) {
  switch (action) {
    case 'archive':
      await archiveEmail(accessToken, emailId);
      break;
    case 'trash':
      await moveToTrash(accessToken, emailId);
      break;
    case 'folder-tickets':
      await moveToFolder(accessToken, emailId, 'Tickets');
      break;
    case 'folder-orders':
      await moveToFolder(accessToken, emailId, 'Orders');
      break;
    case 'folder-investments':
      await moveToFolder(accessToken, emailId, 'Investments');
      break;
    case 'read':
    case 'none':
    default:
      // No move action needed; markAsRead handled separately
      break;
  }
}

/**
 * Decide whether this classified email should go to Slack and which channel.
 * Returns: { notify: boolean, channel: 'important'|'digest'|null, reason: string }
 */
function resolveNotification(result) {
  const { classification, category, amount, amount_currency } = result;

  // Urgent → always notify in #email-important
  if (classification === 'urgent') {
    return { notify: true, channel: 'important', reason: 'urgent' };
  }

  // Unknown → always notify in #email-digest for review
  if (classification === 'unknown') {
    return { notify: true, channel: 'digest', reason: 'unknown — needs review' };
  }

  // Tickets: only notify if amount >= threshold
  if (category === 'ticket' && amount != null) {
    const amountPEN = normalizeToPEN(amount, amount_currency);
    if (amountPEN >= TICKET_NOTIFY_THRESHOLD) {
      return { notify: true, channel: 'digest', reason: `ticket >= ${TICKET_NOTIFY_THRESHOLD} PEN` };
    }
    return { notify: false, channel: null, reason: `ticket < ${TICKET_NOTIFY_THRESHOLD} PEN` };
  }

  // Orders → never notify (just file)
  if (category === 'order') {
    return { notify: false, channel: null, reason: 'order — filed silently' };
  }

  // Investment transactions → notify in digest
  if (category === 'investment') {
    return { notify: true, channel: 'digest', reason: 'investment transaction' };
  }

  // Promotions that survived as informational → notify briefly in digest
  if (category === 'promotion' && classification === 'informational') {
    return { notify: true, channel: 'digest', reason: 'relevant promotion' };
  }

  // Important → notify in digest
  if (classification === 'important') {
    return { notify: true, channel: 'digest', reason: 'important' };
  }

  // Informational → notify briefly in digest
  if (classification === 'informational') {
    return { notify: true, channel: 'digest', reason: 'informational' };
  }

  // Noise → no notification
  return { notify: false, channel: null, reason: 'noise' };
}

/**
 * Rough currency normalization to PEN for threshold comparison.
 * Uses approximate rates — only needs to be ballpark accurate.
 */
function normalizeToPEN(amount, currency) {
  if (!currency || currency === 'PEN') return amount;
  const rates = { USD: 3.7, EUR: 4.0, GBP: 4.7 };
  const rate = rates[currency.toUpperCase()] || 1;
  return amount * rate;
}

/**
 * Process a list of classified emails: execute actions, mark as read, send Slack.
 * Shared between runEmailAgent and runEmailCatchup.
 */
async function processClassified(accessToken, classified, counts) {
  // 1. Execute email actions
  for (const { email, classification } of classified) {
    const action = classification.email_action || 'none';
    if (action !== 'none' && action !== 'read') {
      try {
        await executeAction(accessToken, email.id, action);
        log.ok(`Action "${action}" on: "${email.subject}"`, 1);
      } catch (err) {
        log.error(`Failed action "${action}" on "${email.subject}": ${err.message}`);
      }
    }
  }

  // 2. Mark ALL processed emails as read (after actions complete)
  for (const { email } of classified) {
    try {
      await markAsRead(accessToken, email.id);
    } catch (err) {
      log.verb(`Failed to mark as read: "${email.subject}": ${err.message}`, 1);
    }
  }
  log.ok(`Marked ${classified.length} emails as read`);

  // 3. Route notifications to Slack
  const toNotify = [];
  const unknowns = [];

  for (const item of classified) {
    const notification = resolveNotification(item.classification);
    log.verb(`Notification decision for "${item.email.subject}": ${notification.reason}`, 1);

    if (notification.notify) {
      if (item.classification.classification === 'unknown') {
        unknowns.push(item);
      } else {
        toNotify.push({ ...item, channel: notification.channel });
      }
    }
  }

  // Group by channel + group_key for concise Slack output
  if (toNotify.length > 0) {
    const groups = new Map();

    for (const item of toNotify) {
      const key = `${item.channel}::${item.classification.group_key || item.email.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          channel: item.channel,
          groupKey: item.classification.group_key,
          items: [],
        });
      }
      groups.get(key).items.push(item);
    }

    log.info(`Slack: ${toNotify.length} to notify in ${groups.size} groups`);

    for (const [key, group] of groups) {
      try {
        const webhook = group.channel === 'important' ? WEBHOOK_IMPORTANT : WEBHOOK_DIGEST;
        const payload = formatEmailDigest(group, timeAgo);
        log.verb(`Sending group "${key}" (${group.items.length} emails) → #email-${group.channel}`, 1);
        await sendSlack(webhook, payload);
      } catch (err) {
        log.error(`Failed to send Slack notification: ${err.message}`);
      }
    }
  }

  // Send unknown emails as a review block
  if (unknowns.length > 0) {
    log.info(`Slack: ${unknowns.length} unknown emails for review`);
    try {
      const payload = formatUnknownEmails(unknowns, timeAgo);
      await sendSlack(WEBHOOK_DIGEST, payload);
    } catch (err) {
      log.error(`Failed to send unknown emails to Slack: ${err.message}`);
    }
  }

  const notifiedCount = toNotify.length + unknowns.length;
  const silentCount = classified.length - notifiedCount;
  log.info(`Slack: ${notifiedCount} notified, ${silentCount} filed silently`);
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
  const counts = { urgent: 0, important: 0, informational: 0, noise: 0, unknown: 0, error: 0 };

  for (const email of unseen) {
    try {
      const from = email.from?.emailAddress?.address || 'unknown';
      const fromName = email.from?.emailAddress?.name || from;

      const result = await classify(buildPrompt(profile, email), { effort: 'low' });
      seen.add(email.id);
      counts[result.classification] = (counts[result.classification] || 0) + 1;
      classified.push({ email, classification: result });

      // One-liner per email
      const cat = result.category ? ` (${result.category})` : '';
      const amt = result.amount ? ` ${result.amount} ${result.amount_currency || ''}` : '';
      log.info(`"${email.subject}" from ${fromName} -- ${result.classification}${cat} [${result.email_action || 'none'}]${amt}`, 1);
      log.data(`Classification for "${email.subject}":`, result, 1);
    } catch (err) {
      counts.error++;
      seen.add(email.id);
      log.error(`Failed to process "${email.subject}": ${err.message}`);
    }
  }

  await processClassified(accessToken, classified, counts);
  await saveSeen(seen);

  const parts = [];
  if (counts.urgent > 0) parts.push(`${counts.urgent} urg`);
  if (counts.important > 0) parts.push(`${counts.important} imp`);
  if (counts.informational > 0) parts.push(`${counts.informational} info`);
  if (counts.noise > 0) parts.push(`${counts.noise} noise`);
  if (counts.unknown > 0) parts.push(`${counts.unknown} unknown`);
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
  log.head('Catch-up scan (unread last 2 days, inbox + junk)');

  const accessToken = await getAccessToken();
  const emails = await fetchUnreadRecent(accessToken, { includeJunk: true, lookbackDays: 2 });

  if (emails.length === 0) {
    log.info('No unread emails in the last 2 days. All caught up!');
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
  const counts = { urgent: 0, important: 0, informational: 0, noise: 0, unknown: 0, error: 0 };

  for (const email of unseen) {
    try {
      const from = email.from?.emailAddress?.address || 'unknown';
      const fromName = email.from?.emailAddress?.name || from;
      const folderTag = email._folder === 'junk' ? ' [JUNK]' : '';

      const result = await classify(buildPrompt(profile, email), { effort: 'low' });
      seen.add(email.id);
      counts[result.classification] = (counts[result.classification] || 0) + 1;
      classified.push({ email, classification: result });

      const cat = result.category ? ` (${result.category})` : '';
      const amt = result.amount ? ` ${result.amount} ${result.amount_currency || ''}` : '';
      log.info(`"${email.subject}" from ${fromName}${folderTag} -- ${result.classification}${cat} [${result.email_action || 'none'}]${amt}`, 1);
      log.data(`Classification for "${email.subject}":`, result, 1);

      // Rescue: if a junk email is not noise/spam, move it to inbox
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

  await processClassified(accessToken, classified, counts);
  await saveSeen(seen);

  const parts = [];
  if (counts.urgent > 0) parts.push(`${counts.urgent} urg`);
  if (counts.important > 0) parts.push(`${counts.important} imp`);
  if (counts.informational > 0) parts.push(`${counts.informational} info`);
  if (counts.noise > 0) parts.push(`${counts.noise} noise`);
  if (counts.unknown > 0) parts.push(`${counts.unknown} unknown`);
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
