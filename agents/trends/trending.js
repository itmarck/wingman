import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { summarize } from '../../shared/claude.js';
import { sendSlack, formatTrendingPosts } from '../../shared/slack.js';
import { fetchReddit } from './reddit.js';

const log = createLogger('trends');

const STATE_FILE = 'state/reddit-trending.json';
const WEBHOOK_NEWS = process.env.SLACK_WEBHOOK_NEWS;
const WEBHOOK_LOGS = process.env.SLACK_WEBHOOK_LOGS;
const THRESHOLD = parseInt(process.env.REDDIT_TRENDING_THRESHOLD || '500', 10);
const MAX_NOTIFIED = 500;

async function loadSources() {
  const raw = await readFile('config/sources.json', 'utf-8');
  return JSON.parse(raw);
}

async function loadState() {
  try {
    const data = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { notified: [], lastCleanup: '' };
    }
    throw err;
  }
}

async function saveState(state) {
  await mkdir('state', { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function trendingScore(post) {
  const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
  const clampedAge = Math.max(ageHours, 0.5);
  return (post.score * Math.max(post.num_comments, 1)) / clampedAge;
}

function buildTrendingPrompt(posts) {
  const lines = [
    'Los siguientes posts de Reddit están en tendencia ahora mismo.',
    'Genera un resumen breve para cada uno en español, explicando por qué es relevante o interesante.',
    '',
    'FORMATO — usa Slack mrkdwn (NO markdown estándar):',
    '- Negrita: *texto* (un solo asterisco)',
    '- Cursiva: _texto_',
    '- NO uses ##, ###, ---, **, ```, ni ningún otro markdown estándar',
    '- Un bullet por post con el resumen',
    '',
    'Máximo 1000 caracteres en total.',
    '',
  ];

  for (const p of posts) {
    lines.push(`- [r/${p.subreddit}] "${p.title}" (⬆ ${p.score}, 💬 ${p.num_comments}, ${p.ageLabel})`);
  }

  return lines.join('\n');
}

export async function runRedditTrending() {
  log.info(`Starting Reddit trending scan (threshold: ${THRESHOLD})...`);

  const sources = await loadSources();
  const redditSources = sources.reddit || [];

  if (redditSources.filter((s) => s.active).length === 0) {
    log.info('No active Reddit sources. Skipping trending scan.');
    return;
  }

  const posts = await fetchReddit(redditSources);

  if (posts.length === 0) {
    log.info('No Reddit posts fetched. Skipping trending scan.');
    return;
  }

  const state = await loadState();
  const notifiedSet = new Set(state.notified);

  // Daily cleanup of old notified IDs
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastCleanup !== today) {
    log.info(`Daily cleanup: clearing ${notifiedSet.size} old notified IDs`);
    notifiedSet.clear();
    state.lastCleanup = today;
  }

  // Score and filter
  const scored = posts
    .filter((p) => !notifiedSet.has(p.id))
    .map((p) => {
      const score = trendingScore(p);
      const ageHours = (Date.now() / 1000 - p.created_utc) / 3600;
      const ageLabel = ageHours < 1 ? `${Math.round(ageHours * 60)} min` : `${Math.round(ageHours)}h`;
      return { ...p, trendingScore: score, ageLabel };
    })
    .filter((p) => p.trendingScore >= THRESHOLD)
    .sort((a, b) => b.trendingScore - a.trendingScore);

  log.info(`Trending scan: ${posts.length} posts evaluated, ${scored.length} above threshold (${THRESHOLD})`);

  if (scored.length > 0) {
    for (const p of scored) {
      log.info(`  🔥 r/${p.subreddit}: "${p.title}" (score: ${p.score}, comments: ${p.num_comments}, trending: ${Math.round(p.trendingScore)}, age: ${p.ageLabel})`);
    }

    const prompt = buildTrendingPrompt(scored);
    log.info(`Prompt built (${prompt.length} chars). Calling Claude for trending summary...`);

    const summary = await summarize(prompt);
    log.info(`Trending summary generated (${summary.length} chars). Posting to Slack...`);

    await sendSlack(WEBHOOK_NEWS, formatTrendingPosts(scored, summary));

    // Mark as notified
    for (const p of scored) {
      notifiedSet.add(p.id);
    }

    // Prune to max size
    const notifiedArr = [...notifiedSet];
    state.notified = notifiedArr.slice(-MAX_NOTIFIED);
    await saveState(state);

    const logMsg = `Trending: ${scored.length} posts notified`;
    log.info(logMsg);

    try {
      await sendSlack(WEBHOOK_LOGS, `[trending] ${logMsg}`);
    } catch {
      // Don't fail over a log notification
    }
  } else {
    log.info('No trending posts found this cycle.');
    state.notified = [...notifiedSet];
    await saveState(state);
  }
}

// Direct execution: npm run dev:trending
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  runRedditTrending()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error(`Fatal error: ${err.message}`);
      process.exit(1);
    });
}
