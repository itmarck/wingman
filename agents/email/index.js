import 'dotenv/config';
import { readFile } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { classify } from '../../shared/claude.js';
import { sendSlack, formatEmailImportant, formatEmailDigest } from '../../shared/slack.js';
import { getAccessToken, fetchEmails } from './graph.js';
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

async function processEmail(email, profile, seen) {
  const id = email.id;
  if (seen.has(id)) return null;

  const from = email.from?.emailAddress?.address || 'unknown';
  log.info(`Classifying: "${email.subject}" from ${from}`);

  const classification = await classify(buildPrompt(profile, email));
  seen.add(id);

  log.info(`  → ${classification.classification}: ${classification.reason}`);

  switch (classification.classification) {
    case 'urgent':
      await sendSlack(WEBHOOK_IMPORTANT, formatEmailImportant(email, classification));
      return 'urgent';

    case 'important':
    case 'informational':
      await sendSlack(WEBHOOK_DIGEST, formatEmailDigest(email, classification));
      return classification.classification;

    case 'noise':
    default:
      return 'noise';
  }
}

async function main() {
  log.info('Starting email cycle...');

  const accessToken = await getAccessToken();
  const emails = await fetchEmails(accessToken, LOOKBACK_HOURS);

  if (emails.length === 0) {
    log.info('No new emails found.');
    return;
  }

  const profile = await loadProfile();
  const seen = await loadSeen();

  const counts = { urgent: 0, important: 0, informational: 0, noise: 0, error: 0 };

  for (const email of emails) {
    try {
      const result = await processEmail(email, profile, seen);
      if (result) counts[result]++;
    } catch (err) {
      counts.error++;
      log.error(`Failed to process "${email.subject}": ${err.message}`);
    }
  }

  await saveSeen(seen);

  const summary = `Cycle complete: ${emails.length} emails — ${counts.urgent} urgent, ${counts.important} important, ${counts.informational} informational, ${counts.noise} noise, ${counts.error} errors`;
  log.info(summary);

  try {
    await sendSlack(WEBHOOK_LOGS, `[email-agent] ${summary}`);
  } catch {
    // Don't fail the cycle over a log notification
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
