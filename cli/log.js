import { exec } from './helpers.js';

export function register(program) {
  program
    .command('log')
    .description('View logs')
    .option('-y, --yesterday', "yesterday's log")
    .option('-1, --oneline', 'compact view (depth 0 only)')
    .option('-v, --verbose', 'include verb lines')
    .option('-d, --data', 'include data lines')
    .option('-a, --all', 'everything (verb + data)')
    .option('-s, --summary', 'tick summaries (output.log)')
    .option('-t, --tag <tag>', 'filter by agent tag (mail, trnd, clde, slck, task)')
    .option('--depth <n>', 'max depth (0, 1, 2)')
    .option('-f, --filter <text>', 'text search')
    .option('-e, --errors', 'only error lines')
    .action((opts) => {
      const args = [];
      if (opts.yesterday) args.push('ayer');
      if (opts.oneline) args.push('oneline');
      if (opts.all) args.push('all');
      else {
        if (opts.verbose) args.push('verbose');
        if (opts.data) args.push('data');
      }
      if (opts.summary) args.push('summary');
      if (opts.tag) args.push(opts.tag);
      if (opts.depth != null) args.push('depth', opts.depth);
      if (opts.filter) args.push(opts.filter);
      if (opts.errors) args.push('errors');
      exec('scripts/log.js', args);
    });
}
