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

const ACTION_LABELS = {
  read: 'leído (queda en Inbox)',
  archive: 'archivado',
  trash: 'movido a Trash',
  'folder-tickets': 'movido a Tickets',
  'folder-orders': 'movido a Orders',
  'folder-investments': 'movido a Investments',
  none: 'sin mover',
};

function actionLabel(action) {
  return ACTION_LABELS[action] || action || 'sin mover';
}

function senderLabel(email) {
  const address = email.from?.emailAddress;
  return address?.name || address?.address || 'Desconocido';
}

function leadEmoji(item, fallback) {
  const draft = item.classification || {};
  if (draft.classification === 'scam' || draft.category === 'scam') return '⚠️';
  return fallback;
}

function summaryText(c) {
  const isScam = c.classification === 'scam' || c.category === 'scam';
  const base = (c.summary || '').trim() || c.reason || 'sin resumen';
  if (isScam && !/estafa|scam|phishing/i.test(base)) {
    return `POSIBLE ESTAFA — ${base}`;
  }
  return base;
}

/**
 * Format classified emails for Slack — concise natural language output.
 * Single emails: bold sender + summary + action footer.
 * Groups: bullet list with the same structure per item.
 */
export function formatEmailDigest(group, timeAgo) {
  const channelEmoji = group.channel === 'important' ? CHANNEL_EMOJI.important : CHANNEL_EMOJI.digest;
  const items = group.items;

  if (items.length === 1) {
    const item = items[0];
    const { email, classification } = item;
    const emoji = leadEmoji(item, channelEmoji);
    const sender = senderLabel(email);
    const ago = timeAgo(email.receivedDateTime);
    const flag = classification.needs_action ? ' · 🚩 acción pendiente' : '';
    const action = actionLabel(classification.email_action);

    const text = [
      `${emoji} *${sender}* — ${summaryText(classification)}`,
      `_${ago} · ${action}${flag}_`,
    ].join('\n');

    return { blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
  }

  const bulletLines = items.map((item) => {
    const { email, classification } = item;
    const emoji = leadEmoji(item, '•');
    const sender = senderLabel(email);
    const ago = timeAgo(email.receivedDateTime);
    const flag = classification.needs_action ? ' · 🚩' : '';
    const action = actionLabel(classification.email_action);
    return `${emoji} *${sender}* — ${summaryText(classification)}\n   _${ago} · ${action}${flag}_`;
  });

  const header = `${channelEmoji} *${items.length} correos — ${group.groupKey || 'varios'}*`;
  const text = [header, '', ...bulletLines].join('\n');

  return { blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
}

/**
 * Format unknown/unclassified emails as a review block for Slack.
 * Sent to #email-digest so the user can review and update rules.
 */
export function formatUnknownEmails(unknowns, timeAgo) {
  const bulletLines = unknowns.map(({ email, classification }) => {
    const from = senderLabel(email);
    const ago = timeAgo(email.receivedDateTime);
    const action = actionLabel(classification.email_action);
    return `• *${from}* — ${summaryText(classification)}\n   _${ago} · asunto: ${email.subject} · ${action}_`;
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
