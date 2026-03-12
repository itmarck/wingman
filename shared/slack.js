import { createLogger } from './logger.js';

const log = createLogger('slck');

export async function sendSlack(webhookUrl, payload) {
  if (!webhookUrl) {
    log.warn('No webhook URL provided, skipping Slack notification');
    return;
  }

  const body = typeof payload === 'string' ? { text: payload } : payload;
  const bodyStr = JSON.stringify(body);

  log.info(`POST (${bodyStr.length} chars)`);
  log.verb(`POST → ${webhookUrl.slice(0, 50)}...`);
  log.verb(`Payload: ${bodyStr}`, 1);

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  });

  if (!res.ok) {
    const text = await res.text();
    log.error(`POST failed (${res.status}): ${text}`);
    throw new Error(`Slack webhook failed (${res.status}): ${text}`);
  }

  log.ok(`POST OK (${res.status})`);
}

const CHANNEL_EMOJI = {
  important: '🚨',
  digest: '📬',
};

/**
 * Format classified emails for Slack — concise natural language output.
 * Single emails: one-liner. Groups: bullet list.
 */
export function formatEmailDigest(group, timeAgo) {
  const emoji = group.channel === 'important' ? CHANNEL_EMOJI.important : CHANNEL_EMOJI.digest;
  const items = group.items;

  if (items.length === 1) {
    const { email, classification } = items[0];
    const ago = timeAgo(email.receivedDateTime);
    const text = `${emoji} ${classification.summary} _(${ago})_`;
    return {
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text } },
      ],
    };
  }

  // Grouped: bullet list with shared header
  const bulletLines = items.map(({ email, classification }) => {
    const ago = timeAgo(email.receivedDateTime);
    return `• ${classification.summary} _(${ago})_`;
  });

  const header = `${emoji} *${items.length} correos — ${group.groupKey || 'varios'}*`;
  const text = [header, ...bulletLines].join('\n');

  return {
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text } },
    ],
  };
}

/**
 * Format unknown/unclassified emails as a review block for Slack.
 * Sent to #email-digest so the user can review and update rules.
 */
export function formatUnknownEmails(unknowns, timeAgo) {
  const bulletLines = unknowns.map(({ email, classification }) => {
    const from = email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Desconocido';
    const ago = timeAgo(email.receivedDateTime);
    return `• *${email.subject}* de _${from}_ (${ago})\n  ${classification.summary}`;
  });

  const header = `🔍 *${unknowns.length} correo${unknowns.length > 1 ? 's' : ''} sin clasificar — revisar reglas*`;
  const text = [header, '', ...bulletLines].join('\n');

  return {
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: text.length <= 2900 ? text : text.slice(0, 2900) + '…' } },
    ],
  };
}

export function formatTrendsDigest(digestText) {
  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '📰 *Resumen del día*' },
    },
    { type: 'divider' },
  ];

  if (digestText.length <= 2900) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: digestText } });
  } else {
    const parts = digestText.split(/\n\n/);
    let chunk = '';
    for (const part of parts) {
      if (chunk.length + part.length + 2 > 2900) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: chunk.trim() } });
        chunk = '';
      }
      chunk += (chunk ? '\n\n' : '') + part;
    }
    if (chunk.trim()) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: chunk.trim() } });
    }
  }

  return { blocks };
}

export function formatTrendingPosts(posts, summary) {
  const header = `🔥 *${posts.length === 1 ? 'Tema en tendencia' : `${posts.length} temas en tendencia`}*`;

  const text = [header, '', summary].join('\n');

  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: text.length <= 2900 ? text : text.slice(0, 2900) + '…' } },
  ];

  return { blocks };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const webhookUrl = process.env.SLACK_WEBHOOK_LOGS;
  if (!webhookUrl) {
    log.error('SLACK_WEBHOOK_LOGS not set in .env');
    process.exit(1);
  }
  log.head('Sending test message to #agent-logs...');
  await sendSlack(webhookUrl, '🧪 Test de integración de Wingman — si ves esto, funciona!');
  log.ok('Test message sent successfully');
}
