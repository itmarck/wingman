import { createLogger } from '../../shared/logger.js';

const log = createLogger('trnd');

const CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;

// Reddit requires a descriptive User-Agent: <app>:<version> (by /u/<user>)
const USER_AGENT = `wingman:v1.0 (by /u/${process.env.REDDIT_USERNAME || 'wingman_bot'})`;

// In-memory token cache — refreshed automatically when expired
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required');
  }

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

  if (!res.ok) {
    throw new Error(`Reddit OAuth failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  log.verb(`Reddit token refreshed — expires in ${data.expires_in}s`);
  return cachedToken;
}

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

export async function fetchReddit(subreddits: SubredditConfig[]): Promise<RedditPost[]> {
  const active = subreddits.filter((s) => s.active);

  if (active.length === 0) {
    log.info('No active Reddit sources configured');
    return [];
  }

  // Fall back to unauthenticated if no credentials (local dev without keys)
  const useOAuth = !!(CLIENT_ID && CLIENT_SECRET);
  const token = useOAuth ? await getAccessToken() : null;
  const baseUrl = useOAuth ? 'https://oauth.reddit.com' : 'https://www.reddit.com';

  if (!useOAuth) {
    log.warn('No Reddit credentials — using unauthenticated (may 403 on servers)');
  }

  const results = await Promise.allSettled(
    active.map(async (sub) => {
      const limit = sub.limit || 10;
      const url = `${baseUrl}/r/${sub.subreddit}/hot.json?limit=${limit}`;

      log.info(`Fetching Reddit: r/${sub.subreddit}`, 1);

      const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url, { headers });

      if (!res.ok) throw new Error(`Reddit r/${sub.subreddit} failed (${res.status})`);

      const data = await res.json() as any;
      const posts = data.data.children.filter((c: any) => !c.data.stickied && c.data.score >= 3);

      log.ok(`Reddit r/${sub.subreddit}: ${data.data.children.length} total, ${posts.length} after filtering`, 1);
      for (const c of posts) {
        log.data(`r/${sub.subreddit}: "${c.data.title}" (score:${c.data.score} cmt:${c.data.num_comments})`, null, 2);
      }

      return posts.map((c: any): RedditPost => ({
        id: c.data.id,
        title: c.data.title,
        url: `https://redd.it/${c.data.id}`,
        score: c.data.score,
        subreddit: c.data.subreddit,
        num_comments: c.data.num_comments,
        created_utc: c.data.created_utc,
      }));
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
