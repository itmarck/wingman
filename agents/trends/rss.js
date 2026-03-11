import Parser from 'rss-parser';
import { createLogger } from '../../shared/logger.js';

const log = createLogger('trnd');
const parser = new Parser({ timeout: 15_000 });

export async function fetchRSS(sources) {
  const active = sources.filter((s) => s.active);

  if (active.length === 0) {
    log.info('No active RSS sources configured');
    return [];
  }

  const results = await Promise.allSettled(
    active.map(async (source) => {
      log.info(`Fetching RSS: ${source.name} (${source.category})`, 1);
      log.verb(`RSS URL: ${source.url}`, 1);

      const feed = await parser.parseURL(source.url);
      const sliced = feed.items.slice(0, 10);
      log.ok(`RSS "${source.name}": ${feed.items.length} items, using top ${sliced.length}`, 1);

      // Log each item as data
      for (const item of sliced) {
        log.data(`[${source.name}] ${item.title || '(untitled)'}`, null, 2);
      }

      return sliced.map((item) => ({
        title: item.title || '(untitled)',
        link: item.link || '',
        snippet: item.contentSnippet?.slice(0, 100) || '',
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
      log.verb(`RSS error detail: ${result.reason.stack}`, 1);
    }
  }

  log.info(`Collected ${items.length} RSS items from ${active.length} feeds`);
  return items;
}
