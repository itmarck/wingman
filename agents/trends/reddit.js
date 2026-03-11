import { createLogger } from '../../shared/logger.js';

const log = createLogger('trnd');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function fetchReddit(subreddits) {
  const active = subreddits.filter((s) => s.active);

  if (active.length === 0) {
    log.info('No active Reddit sources configured');
    return [];
  }

  const results = await Promise.allSettled(
    active.map(async (sub) => {
      const limit = sub.limit || 10;
      const url = `https://www.reddit.com/r/${sub.subreddit}/hot.json?limit=${limit}`;

      log.info(`Fetching Reddit: r/${sub.subreddit}`, 1);
      log.verb(`Reddit URL: ${url}`, 1);

      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`Reddit r/${sub.subreddit} failed (${res.status})`);
      }

      const data = await res.json();
      const posts = data.data.children.filter((c) => !c.data.stickied && c.data.score >= 3);

      log.ok(`Reddit r/${sub.subreddit}: ${data.data.children.length} total, ${posts.length} after filtering`, 1);

      // Log each post as data
      for (const c of posts) {
        log.data(`r/${sub.subreddit}: "${c.data.title}" (score:${c.data.score} cmt:${c.data.num_comments})`, null, 2);
      }

      return posts.map((c) => ({
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

  const items = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      log.error(`Reddit fetch failed: ${result.reason.message}`);
      log.verb(`Reddit error detail: ${result.reason.stack}`, 1);
    }
  }

  log.info(`Collected ${items.length} Reddit posts from ${active.length} subreddits`);
  return items;
}
