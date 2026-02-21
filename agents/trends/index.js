import 'dotenv/config';
import { readFile } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { summarize } from '../../shared/claude.js';
import { sendSlack, formatTrendsDigest } from '../../shared/slack.js';
import { fetchRSS } from './rss.js';
import { fetchReddit } from './reddit.js';

const log = createLogger('trends-agent');

const WEBHOOK_NEWS = process.env.SLACK_WEBHOOK_NEWS;
const WEBHOOK_LOGS = process.env.SLACK_WEBHOOK_LOGS;

async function loadSources() {
  const raw = await readFile('config/sources.json', 'utf-8');
  return JSON.parse(raw);
}

function buildPrompt(rssItems, redditItems, categories) {
  const lines = [
    'You are a personal news curator. Summarize the most interesting and relevant items below into a concise morning digest.',
    `Focus on these interest categories: ${categories.join(', ')}.`,
    'Format the output as a Slack-friendly markdown digest with sections and bullet points.',
    'Keep it under 2000 characters. Prioritize quality over quantity — skip low-value items.',
    '',
    '---',
    '',
  ];

  if (rssItems.length > 0) {
    lines.push('## RSS Feed Items', '');
    for (const item of rssItems) {
      lines.push(`- [${item.source}] ${item.title}`);
      if (item.snippet) lines.push(`  ${item.snippet.slice(0, 150)}`);
    }
    lines.push('');
  }

  if (redditItems.length > 0) {
    lines.push('## Reddit Posts', '');
    for (const item of redditItems) {
      lines.push(`- [r/${item.subreddit}] ${item.title} (⬆ ${item.score}, 💬 ${item.num_comments})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  log.info('Starting trends cycle...');

  const sources = await loadSources();

  const [rssItems, redditItems] = await Promise.all([
    fetchRSS(sources.rss || []),
    fetchReddit(sources.reddit || []),
  ]);

  const totalItems = rssItems.length + redditItems.length;

  if (totalItems === 0) {
    log.info('No items fetched from any source. Skipping digest.');
    return;
  }

  log.info(`Total items collected: ${totalItems}. Generating digest...`);

  const prompt = buildPrompt(rssItems, redditItems, sources.interest_categories || []);
  const digest = await summarize(prompt);

  await sendSlack(WEBHOOK_NEWS, formatTrendsDigest(digest));

  const summary = `Cycle complete: ${rssItems.length} RSS + ${redditItems.length} Reddit → digest posted`;
  log.info(summary);

  try {
    await sendSlack(WEBHOOK_LOGS, `[trends-agent] ${summary}`);
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
