import chalk from 'chalk';

const AGENTS = {
  email: {
    module: '../agents/email/index.js',
    fn: 'runEmailAgent',
    description: 'Process unread emails',
    detail: 'Fetch unread emails from the last EMAIL_LOOKBACK_HOURS via Microsoft Graph, classify each via the configured AI provider using config/profile.md, execute the email action (folder move / archive / trash / read), and route Slack notifications by category.',
  },
  catchup: {
    module: '../agents/email/index.js',
    fn: 'runEmailCatchup',
    description: 'Scan missed emails (inbox + junk, last 2 days)',
    detail: 'Fetch all unread emails from the last 2 days across inbox and junk. Misclassified junk that is not noise gets rescued back to inbox. All processed emails are marked as read.',
  },
  digest: {
    module: '../agents/trends/index.js',
    fn: 'runTrendsDigest',
    description: 'Morning news digest from RSS + Reddit',
    detail: 'Fetch RSS feeds and Reddit subreddits from config/sources.json, summarize via the AI provider, and post the digest to #news-digest.',
  },
  trending: {
    module: '../agents/trends/trending.js',
    fn: 'runRedditTrending',
    description: 'Detect Reddit posts trending above the threshold',
    detail: 'Score Reddit posts as (score × comments) / age_hours. Posts above REDDIT_TRENDING_VIRAL are always notified. Posts above REDDIT_TRENDING_THRESHOLD are filtered by interest_categories before notification.',
  },
  inbox: {
    module: '../agents/tasks/inbox.js',
    fn: 'runInboxAgent',
    description: 'Process Notion inbox into tasks',
    detail: 'Read items with status=received from the Notion inbox database, classify each via the AI provider using config/goals.md, create the corresponding task with subtasks, and mark the inbox item as processed.',
  },
};

async function runAgent(id) {
  const entry = AGENTS[id];
  try {
    const mod = await import(entry.module);
    await mod[entry.fn]();
  } catch (error) {
    console.error(chalk.red(`✗ ${id}: ${error.message}`));
  }
}

async function flush() {
  const { flushLogs } = await import('../shared/logger.js');
  await flushLogs();
}

export function register(program) {
  const cmd = program
    .command('run')
    .description('Execute an agent once. Each agent has its own --help with details.');

  for (const [id, entry] of Object.entries(AGENTS)) {
    cmd
      .command(id)
      .description(entry.description)
      .addHelpText('after', `\n${entry.detail}\n`)
      .action(async () => {
        await runAgent(id);
        await flush();
      });
  }

  cmd
    .command('all')
    .description('Run every agent sequentially')
    .action(async () => {
      for (const id of Object.keys(AGENTS)) await runAgent(id);
      await flush();
    });

  cmd.action(() => {
    console.log(chalk.bold('\nAvailable agents\n'));
    for (const [id, { description }] of Object.entries(AGENTS)) {
      console.log(`  ${chalk.bold(id.padEnd(12))} ${description}`);
    }
    console.log(`  ${chalk.bold('all'.padEnd(12))} Run every agent sequentially`);
    console.log(chalk.dim('\nRun: wingman run <agent>'));
    console.log(chalk.dim('Help: wingman run <agent> --help\n'));
  });
}
