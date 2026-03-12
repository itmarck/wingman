import chalk from 'chalk';

const AGENTS = {
  email: {
    module: '../agents/email/index.js',
    fn: 'runEmailAgent',
    description: 'Process unread emails',
  },
  catchup: {
    module: '../agents/email/index.js',
    fn: 'runEmailCatchup',
    description: 'Scan missed emails (inbox + junk)',
  },
  digest: {
    module: '../agents/trends/index.js',
    fn: 'runTrendsDigest',
    description: 'Morning news digest',
  },
  trending: {
    module: '../agents/trends/trending.js',
    fn: 'runRedditTrending',
    description: 'Reddit trending detection',
  },
  inbox: {
    module: '../agents/tasks/inbox.js',
    fn: 'runInboxAgent',
    description: 'Process Notion inbox',
  },
};

export function register(program) {
  program
    .command('run')
    .description('Execute agents')
    .argument('[agent]', [...Object.keys(AGENTS), 'all'].join(' | '))
    .action(async (agent) => {
      if (!agent) {
        console.log(chalk.bold('\nAvailable agents\n'));
        for (const [id, { description }] of Object.entries(AGENTS)) {
          console.log(`  ${chalk.bold(id.padEnd(12))} ${description}`);
        }
        console.log(`  ${chalk.bold('all'.padEnd(12))} Run all agents`);
        console.log(chalk.dim('\nRun: wingman run <agent>\n'));
        return;
      }

      if (agent !== 'all' && !AGENTS[agent]) {
        console.error(`Unknown agent: ${agent}. Available: ${[...Object.keys(AGENTS), 'all'].join(', ')}`);
        process.exit(1);
      }

      const targets = agent === 'all' ? Object.entries(AGENTS) : [[agent, AGENTS[agent]]];

      for (const [id, entry] of targets) {
        try {
          const mod = await import(entry.module);
          await mod[entry.fn]();
        } catch (err) {
          console.error(chalk.red(`✗ ${id}: ${err.message}`));
        }
      }

      const { flushLogs } = await import('../shared/logger.js');
      await flushLogs();
    });
}
