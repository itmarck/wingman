import 'dotenv/config';
import { readFile } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { classify } from '../../shared/claude.js';
import { sendSlack, formatEmailGroup } from '../../shared/slack.js';
import { getAccessToken, fetchEmails, markAsRead, archiveEmail, moveToTrash } from './graph.js';
import { loadSeen, saveSeen } from './state.js';

const log = createLogger('email-agent');

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

async function main() {
  log.info('Starting email cycle...');

  const accessToken = await getAccessToken();
  const emails = await fetchEmails(accessToken, LOOKBACK_HOURS);

  if (emails.length === 0) {
    log.info('No emails in lookback window.');
    return;
  }

  const seen = await loadSeen();

  // Double filter: skip emails already read in Outlook OR already processed by agent
  const unseen = emails.filter((e) => {
    if (seen.has(e.id)) return false;
    if (e.isRead) {
      // Already read by user in Outlook — mark as seen so we don't check again
      seen.add(e.id);
      return false;
    }
    return true;
  });

  if (unseen.length === 0) {
    log.info(`All ${emails.length} emails already read or processed. Nothing to do.`);
    await saveSeen(seen);
    return;
  }

  log.info(`${unseen.length} new unread emails to classify (${emails.length - unseen.length} skipped)`);

  const profile = await loadProfile();
  const classified = [];
  const counts = { urgent: 0, important: 0, informational: 0, noise: 0, error: 0 };

  // Phase 1: Classify all unseen emails
  for (const email of unseen) {
    try {
      const from = email.from?.emailAddress?.address || 'unknown';
      log.info(`Classifying: "${email.subject}" from ${from}`);

      const result = await classify(buildPrompt(profile, email));
      seen.add(email.id);

      log.info(`  → ${result.classification} [${result.email_action || 'none'}]: ${result.reason}`);
      counts[result.classification]++;

      classified.push({ email, classification: result });
    } catch (err) {
      counts.error++;
      seen.add(email.id);
      log.error(`Failed to process "${email.subject}": ${err.message}`);
    }
  }

  // Phase 2: Execute email actions (mark read, archive, trash)
  for (const { email, classification } of classified) {
    const action = classification.email_action || 'none';
    if (action === 'none') continue;

    try {
      await executeAction(accessToken, email.id, action);
      log.info(`  Action "${action}" executed on: "${email.subject}"`);
    } catch (err) {
      log.error(`Failed action "${action}" on "${email.subject}": ${err.message}`);
    }
  }

  // Phase 3: Group non-noise emails for Slack
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

  const summary = `Cycle complete: ${emails.length} fetched, ${unseen.length} new — ${counts.urgent} urgent, ${counts.important} important, ${counts.informational} info, ${counts.noise} noise, ${counts.error} errors`;
  log.info(summary);

  // Only log to Slack if something actually happened
  if (unseen.length > 0) {
    try {
      await sendSlack(WEBHOOK_LOGS, `[email-agent] ${summary}`);
    } catch {
      // Don't fail the cycle over a log notification
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
