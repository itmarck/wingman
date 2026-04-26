import { readFile, writeFile, mkdir } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { summarize } from '../../shared/ai/index.js';
import { sendSlack, formatTrendingPosts } from '../../shared/slack.js';
import { fetchReddit } from './reddit.js';

const log = createLogger('trnd');

const STATE_FILE = 'state/reddit-trending.json';
const WEBHOOK_NEWS = process.env.SLACK_WEBHOOK_NEWS;
const WEBHOOK_LOGS = process.env.SLACK_WEBHOOK_LOGS;
const THRESHOLD = parseInt(process.env.REDDIT_TRENDING_THRESHOLD || '500', 10);
const VIRAL_THRESHOLD = parseInt(process.env.REDDIT_TRENDING_VIRAL || '5000', 10);
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

function buildTrendingPrompt(posts, interestCategories) {
  const lines = [
    'Posts trending en Reddit. [VIRAL]=incluir siempre. [CANDIDATO]=solo si coincide con mis intereses, sino omitir.',
    `Intereses: ${interestCategories.join(', ')}`,
    'Formato: Slack mrkdwn. Un bullet por post: • Título en español (<URL|r/SUB>): resumen breve. Sin header/footer. NO uses ##, **, ```, ---.',
    'Si ninguno es relevante responde: NINGUNO',
    'Máx 1000 chars.',
    '',
  ];

  for (const p of posts) {
    const tag = p.trendingScore >= VIRAL_THRESHOLD ? 'VIRAL' : 'CANDIDATO';
    lines.push(`- [${tag}] [r/${p.subreddit}] "${p.title}" (${p.score}↑ ${p.num_comments}c ${p.ageLabel}) → ${p.url}`);
  }

  return lines.join('\n');
}

export async function runRedditTrending() {
  if (process.env.REDDIT_ENABLED === '0') {
    log.info('Reddit disabled via REDDIT_ENABLED=0');
    return { summary: 'trending: disabled' };
  }

  log.head(`Reddit trending scan (threshold: ${THRESHOLD}, viral: ${VIRAL_THRESHOLD})`);

  const sources = await loadSources();
  const redditSources = sources.reddit || [];
  const interestCategories = sources.interest_categories || [];

  if (redditSources.filter((s) => s.active).length === 0) {
    log.info('No active Reddit sources. Skipping trending scan');
    return { summary: 'trending: no sources' };
  }

  const posts = await fetchReddit(redditSources);

  if (posts.length === 0) {
    log.info('No Reddit posts fetched. Skipping trending scan');
    return { summary: 'trending: no posts' };
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

  log.info(`Trending scan: ${posts.length} evaluated, ${scored.length} above threshold (${THRESHOLD})`);

  if (scored.length > 0) {
    // Log each trending post as data with scores
    for (const p of scored) {
      log.data(`r/${p.subreddit}: "${p.title}" -- score:${p.score} cmt:${p.num_comments} trend:${Math.round(p.trendingScore)} age:${p.ageLabel}`, null, 1);
    }

    const viralCount = scored.filter((p) => p.trendingScore >= VIRAL_THRESHOLD).length;
    const candidateCount = scored.length - viralCount;
    log.info(`Breakdown: ${viralCount} viral + ${candidateCount} candidates`);

    const prompt = buildTrendingPrompt(scored, interestCategories);
    log.info(`Calling Claude (${prompt.length} chars) for trending summary...`);

    const summary = await summarize(prompt, { effort: 'low' });

    // Claude responds NINGUNO when no candidates match interests and there are no viral posts
    if (summary.trim() === 'NINGUNO') {
      log.info('Claude filtered all candidates — none matched interests');
      for (const p of scored) notifiedSet.add(p.id);
      state.notified = [...notifiedSet].slice(-MAX_NOTIFIED);
      await saveState(state);
      return { summary: `trending: ${scored.length} evaluated, 0 relevant` };
    }

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

    const summaryText = `trending: ${scored.length} notified`;
    log.ok(summaryText);

    try {
      await sendSlack(WEBHOOK_LOGS, `[trending] ${summaryText}`);
    } catch {
      // Don't fail over a log notification
    }

    return { summary: summaryText };
  } else {
    log.info('No trending posts found this cycle');
    state.notified = [...notifiedSet];
    await saveState(state);
    return { summary: 'trending: 0 found' };
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
