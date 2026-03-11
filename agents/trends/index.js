import 'dotenv/config';
import { readFile } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { summarize } from '../../shared/claude.js';
import { sendSlack, formatTrendsDigest } from '../../shared/slack.js';
import { fetchRSS } from './rss.js';
import { fetchReddit } from './reddit.js';

const log = createLogger('trnd');

const WEBHOOK_NEWS = process.env.SLACK_WEBHOOK_NEWS;
const WEBHOOK_LOGS = process.env.SLACK_WEBHOOK_LOGS;

async function loadSources() {
  const raw = await readFile('config/sources.json', 'utf-8');
  return JSON.parse(raw);
}

function buildPrompt(rssItems, redditItems, categories) {
  const lines = [
    `Resumen matutino en español. Intereses: ${categories.join(', ')}.`,
    'Formato: Slack mrkdwn. *negrita*, _cursiva_, <URL|texto>, bullets con •. Emojis en encabezados de sección. NO uses ##, **, ```, ---.',
    'Incluye <URL|link> en cada item relevante. Máx 2500 chars. Omite lo que no aporte valor.',
    'Fuentes oficiales Perú: solo lo de impacto real (leyes, decretos, sentencias, cambios tributarios). Ignora trámites rutinarios.',
    '',
  ];

  if (rssItems.length > 0) {
    lines.push('RSS:');
    for (const item of rssItems) {
      const snippet = item.snippet ? ` | ${item.snippet.slice(0, 100)}` : '';
      lines.push(`- [${item.source}] ${item.title} → ${item.link}${snippet}`);
    }
    lines.push('');
  }

  if (redditItems.length > 0) {
    lines.push('Reddit:');
    for (const item of redditItems) {
      lines.push(`- [r/${item.subreddit}] ${item.title} (${item.score}↑ ${item.num_comments}c) → ${item.url}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function runTrendsDigest() {
  log.head('Trends digest cycle');

  const sources = await loadSources();

  const [rssItems, redditItems] = await Promise.all([
    fetchRSS(sources.rss || []),
    fetchReddit(sources.reddit || []),
  ]);

  const totalItems = rssItems.length + redditItems.length;

  if (totalItems === 0) {
    log.info('No items fetched from any source. Skipping digest');
    return { summary: 'digest: no items' };
  }

  log.info(`Total items: ${rssItems.length} RSS + ${redditItems.length} Reddit = ${totalItems}`);

  const prompt = buildPrompt(rssItems, redditItems, sources.interest_categories || []);
  log.info(`Calling Claude (${prompt.length} chars)...`);

  const digest = await summarize(prompt, { effort: 'low' });
  log.info(`Digest generated (${digest.length} chars). Posting to Slack...`);

  await sendSlack(WEBHOOK_NEWS, formatTrendsDigest(digest));

  const summaryText = `digest: posted (${rssItems.length} RSS + ${redditItems.length} Reddit)`;
  log.ok(`Cycle done: ${rssItems.length} RSS + ${redditItems.length} Reddit → digest posted`);

  try {
    await sendSlack(WEBHOOK_LOGS, `[trends-agent] ${summaryText}`);
  } catch {
    // Don't fail the cycle over a log notification
  }

  return { summary: summaryText };
}

// Direct execution: npm run dev:trends
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  runTrendsDigest()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error(`Fatal error: ${err.message}`);
      process.exit(1);
    });
}
