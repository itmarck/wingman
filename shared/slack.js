import 'dotenv/config';
import { createLogger } from './logger.js';

const log = createLogger('slack');

export async function sendSlack(webhookUrl, payload) {
  if (!webhookUrl) {
    log.warn('No webhook URL provided, skipping Slack notification');
    return;
  }

  const body = typeof payload === 'string' ? { text: payload } : payload;
  const bodyStr = JSON.stringify(body);

  log.info(`Slack POST (${bodyStr.length} chars)`);
  log.verbose(`Slack POST → ${webhookUrl.slice(0, 50)}...`);
  log.verbose(`Slack payload: ${bodyStr}`);

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  });

  if (!res.ok) {
    const text = await res.text();
    log.error(`Slack POST failed (${res.status}): ${text}`);
    throw new Error(`Slack webhook failed (${res.status}): ${text}`);
  }

  log.info(`Slack POST OK (${res.status})`);
}

const LEVEL_EMOJI = {
  urgent: '🚨',
  important: '📌',
  informational: 'ℹ️',
};

const LEVEL_LABEL = {
  urgent: 'URGENTE',
  important: 'IMPORTANTE',
  informational: 'INFO',
};

export function formatEmailGroup(group, timeAgo) {
  const emoji = LEVEL_EMOJI[group.classification] || '📧';
  const label = LEVEL_LABEL[group.classification] || group.classification.toUpperCase();
  const items = group.items;

  // Single email — concise one-message format
  if (items.length === 1) {
    return formatSingleEmail(items[0], emoji, label, timeAgo);
  }

  // Multiple similar emails — grouped into one message
  return formatGroupedEmails(items, emoji, label, group, timeAgo);
}

function formatSingleEmail({ email, classification }, emoji, label, timeAgo) {
  const from = email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Desconocido';
  const ago = timeAgo(email.receivedDateTime);

  const lines = [`${emoji} *${label}*`, ''];
  lines.push(`[${ago}] ${classification.summary}`);
  lines.push(`_De: ${from}_`);

  if (classification.suggested_action) {
    lines.push('');
    lines.push(`*Acción:* ${classification.suggested_action}`);
  }

  if (classification.draft_reply) {
    lines.push('');
    lines.push(`*Borrador de respuesta:*`);
    lines.push(`>>>${classification.draft_reply}`);
  }

  return {
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    ],
  };
}

function formatGroupedEmails(items, emoji, label, group, timeAgo) {
  const count = items.length;
  const firstClassification = items[0].classification;

  const header = `${emoji} *${label}* — ${count} correos similares`;

  const bulletLines = items.map(({ email, classification }) => {
    const ago = timeAgo(email.receivedDateTime);
    const from = email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Desconocido';
    return `• [${ago}] ${classification.summary} — _${from}_`;
  });

  const lines = [header, '', ...bulletLines];

  if (firstClassification.suggested_action) {
    lines.push('');
    lines.push(`*Acción:* ${firstClassification.suggested_action}`);
  }

  return {
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    ],
  };
}

export function formatTrendsDigest(digestText) {
  // Slack sections have a 3000 char limit — split if needed
  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '📰 *Resumen del día*' },
    },
    { type: 'divider' },
  ];

  // Split on double newlines to respect section boundaries
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

  const postLines = posts.map((p) =>
    `• <${p.url}|r/${p.subreddit}> — *${p.title}* (⬆ ${p.score}, 💬 ${p.num_comments}, ${p.ageLabel})`
  );

  const lines = [header, '', ...postLines];

  if (summary) {
    lines.push('', summary);
  }

  const text = lines.join('\n');

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
  log.info('Sending test message to #agent-logs...');
  await sendSlack(webhookUrl, '🧪 Test de integración de Wingman — si ves esto, funciona!');
  log.info('Test message sent successfully.');
}
