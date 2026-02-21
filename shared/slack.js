import 'dotenv/config';
import { createLogger } from './logger.js';

const log = createLogger('slack');

export async function sendSlack(webhookUrl, payload) {
  if (!webhookUrl) {
    log.warn('No webhook URL provided, skipping Slack notification');
    return;
  }

  const body = typeof payload === 'string' ? { text: payload } : payload;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Slack webhook failed (${res.status}): ${text}`);
  }
}

export function formatEmailImportant(email, classification) {
  const from = email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown';
  const fromAddr = email.from?.emailAddress?.address || '';

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🚨 ${classification.classification.toUpperCase()}: ${email.subject || '(no subject)'}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*From:*\n${from} (${fromAddr})` },
        { type: 'mrkdwn', text: `*Received:*\n${new Date(email.receivedDateTime).toLocaleString()}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Summary:*\n${classification.summary}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Reason:*\n${classification.reason}` },
    },
  ];

  if (classification.suggested_action) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Suggested action:*\n${classification.suggested_action}` },
    });
  }

  if (classification.draft_reply) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Draft reply:*\n>>>${classification.draft_reply}` },
      },
    );
  }

  return { blocks };
}

export function formatEmailDigest(email, classification) {
  const from = email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown';

  return {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${email.subject || '(no subject)'}*\nFrom: ${from} · _${classification.classification}_\n${classification.summary}`,
        },
      },
    ],
  };
}

export function formatTrendsDigest(digestText) {
  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📰 Morning Digest' },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: digestText },
      },
    ],
  };
}

// Standalone test
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const webhookUrl = process.env.SLACK_WEBHOOK_LOGS;
  if (!webhookUrl) {
    log.error('SLACK_WEBHOOK_LOGS not set in .env');
    process.exit(1);
  }
  log.info('Sending test message to #agent-logs...');
  await sendSlack(webhookUrl, '🧪 Wingman Slack integration test — if you see this, it works!');
  log.info('Test message sent successfully.');
}
