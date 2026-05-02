import Parser from 'rss-parser';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('trnd');

const CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const USER_AGENT = `wingman:v1.0 (by /u/${process.env.REDDIT_USERNAME || 'wingman_bot'})`;

// ─── OAuth (primary) ────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`Reddit OAuth failed (${res.status}): ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  log.verb(`Reddit token refreshed — expires in ${data.expires_in}s`);
  return cachedToken;
}

// ─── Types ──────────────────────────────────────────────────────

export interface RedditPost {
  id: string;
  title: string;
  url: string;
  score: number;
  subreddit: string;
  num_comments: number;
  created_utc: number;
}

interface SubredditConfig {
  subreddit: string;
  active: boolean;
  limit?: number;
}

// ─── OAuth fetch ────────────────────────────────────────────────

async function fetchViaOAuth(sub: SubredditConfig, token: string): Promise<RedditPost[]> {
  const limit = sub.limit || 25;
  const res = await fetch(
    `https://oauth.reddit.com/r/${sub.subreddit}/hot.json?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT } },
  );
  if (!res.ok) throw new Error(`Reddit r/${sub.subreddit} OAuth failed (${res.status})`);

  const data = await res.json() as any;
  return data.data.children
    .filter((c: any) => !c.data.stickied && c.data.score >= 3)
    .map((c: any): RedditPost => ({
      id: c.data.id,
      title: c.data.title,
      url: `https://redd.it/${c.data.id}`,
      score: c.data.score,
      subreddit: c.data.subreddit,
      num_comments: c.data.num_comments,
      created_utc: c.data.created_utc,
    }));
}

// ─── RSS fetch (fallback) ────────────────────────────────────────
// Reddit's RSS hot feed works from servers without auth.
// Real scores aren't available — use positional scoring so the
// trending threshold still applies: top-ranked hot post = highest score.

const rssParser = new Parser({ timeout: 15_000 });

async function fetchViaRSS(sub: SubredditConfig): Promise<RedditPost[]> {
  const limit = sub.limit || 25;
  const feed = await rssParser.parseURL(
    `https://www.reddit.com/r/${sub.subreddit}/hot.rss?limit=${limit}`,
  );

  return feed.items
    .filter((item) => item.title && item.link)
    .map((item, index): RedditPost => {
      // Positional score: rank 1 → (N)*1000, rank N → 1000
      // Keeps relative order and stays above typical threshold values.
      const syntheticScore = (feed.items.length - index) * 1000;
      const id = (item.link ?? '').split('/comments/')[1]?.split('/')[0] ?? `rss-${index}`;
      const pubDate = item.pubDate ? new Date(item.pubDate).getTime() / 1000 : Date.now() / 1000;

      return {
        id,
        title: item.title ?? '',
        url: item.link ?? '',
        score: syntheticScore,
        subreddit: sub.subreddit,
        num_comments: 0,
        created_utc: pubDate,
      };
    });
}

// ─── Main export ─────────────────────────────────────────────────

export async function fetchReddit(subreddits: SubredditConfig[]): Promise<RedditPost[]> {
  const active = subreddits.filter((s) => s.active);
  if (active.length === 0) {
    log.info('No active Reddit sources configured');
    return [];
  }

  const useOAuth = !!(CLIENT_ID && CLIENT_SECRET);
  const token = useOAuth ? await getAccessToken() : null;

  if (useOAuth) {
    log.verb('Reddit: using OAuth API');
  } else {
    log.verb('Reddit: no credentials — using RSS fallback');
  }

  const results = await Promise.allSettled(
    active.map(async (sub) => {
      log.info(`Fetching Reddit: r/${sub.subreddit}`, 1);
      const posts = useOAuth && token
        ? await fetchViaOAuth(sub, token)
        : await fetchViaRSS(sub);

      log.ok(`Reddit r/${sub.subreddit}: ${posts.length} posts`, 1);
      for (const p of posts) {
        log.data(`r/${sub.subreddit}: "${p.title}" (score:${p.score})`, null, 2);
      }
      return posts;
    }),
  );

  const items: RedditPost[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      log.error(`Reddit fetch failed: ${(result.reason as Error).message}`);
    }
  }

  log.info(`Collected ${items.length} Reddit posts from ${active.length} subreddits`);
  return items;
}
