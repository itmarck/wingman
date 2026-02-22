import Parser from 'rss-parser';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('trnd');
const parser = new Parser({ timeout: 15_000 });

export async function fetchRSS(sources) {
  const active = sources.filter((s) => s.active);

  if (active.length === 0) {
    log.info('No active RSS sources configured.');
    return [];
  }

  const results = await Promise.allSettled(
    active.map(async (source) => {
      log.info(`Fetching RSS: ${source.name} (${source.category})`);
      log.data(`RSS URL: ${source.url}`);

      const feed = await parser.parseURL(source.url);
      const sliced = feed.items.slice(0, 10);
      log.ok(`RSS "${source.name}": ${feed.items.length} items, using top ${sliced.length}`);

      return sliced.map((item) => ({
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
      log.data(`RSS error detail: ${result.reason.stack}`);
    }
  }

  log.info(`Collected ${items.length} RSS items from ${active.length} feeds`);
  return items;
}
