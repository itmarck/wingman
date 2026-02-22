import Parser from 'rss-parser';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('trends');
const parser = new Parser({ timeout: 15_000 });

export async function fetchRSS(sources) {
  const active = sources.filter((s) => s.active);

  if (active.length === 0) {
    log.info('No active RSS sources configured.');
    return [];
  }

  const results = await Promise.allSettled(
    active.map(async (source) => {
      log.info(`Fetching RSS: ${source.name}`);
      log.verbose(`RSS URL: ${source.url}`);

      const feed = await parser.parseURL(source.url);
      log.verbose(`RSS "${source.name}" returned ${feed.items.length} items`);

      return feed.items.slice(0, 10).map((item) => ({
        title: item.title || '(untitled)',
        link: item.link || '',
        snippet: item.contentSnippet?.slice(0, 200) || '',
        source: source.name,
        category: source.category,
      }));
    }),
  );

  const items = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      log.error(`RSS fetch failed: ${result.reason.message}`);
      log.verbose(`RSS error detail: ${result.reason.stack}`);
    }
  }

  log.info(`Collected ${items.length} RSS items from ${active.length} feeds`);
  return items;
}
