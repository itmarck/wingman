import { createLogger } from '../../shared/logger.js';

const log = createLogger('trends');
const USER_AGENT = 'wingman/1.0';

export async function fetchReddit(subreddits) {
  const active = subreddits.filter((s) => s.active);

  if (active.length === 0) {
    log.info('No active Reddit sources configured.');
    return [];
  }

  const results = await Promise.allSettled(
    active.map(async (sub) => {
      const limit = sub.limit || 10;
      const url = `https://www.reddit.com/r/${sub.subreddit}/hot.json?limit=${limit}`;

      log.info(`Fetching Reddit: r/${sub.subreddit}`);
      log.verbose(`Reddit URL: ${url}`);

      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (!res.ok) {
        throw new Error(`Reddit r/${sub.subreddit} failed (${res.status})`);
      }

      const data = await res.json();
      const posts = data.data.children.filter((c) => !c.data.stickied);

      log.verbose(`Reddit r/${sub.subreddit}: ${data.data.children.length} total, ${posts.length} after filtering stickied`);

      return posts.map((c) => ({
        title: c.data.title,
        url: `https://reddit.com${c.data.permalink}`,
        score: c.data.score,
        subreddit: c.data.subreddit,
        num_comments: c.data.num_comments,
      }));
    }),
  );

  const items = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      log.error(`Reddit fetch failed: ${result.reason.message}`);
      log.verbose(`Reddit error detail: ${result.reason.stack}`);
    }
  }

  log.info(`Collected ${items.length} Reddit posts from ${active.length} subreddits`);
  return items;
}
