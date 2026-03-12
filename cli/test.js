import chalk from 'chalk';
import { exec } from './helpers.js';

const TARGETS = {
  slack: {
    script: 'shared/slack.js',
    description: 'Slack webhook delivery',
  },
  claude: {
    script: 'shared/claude.js',
    description: 'Claude CLI connection',
  },
  notion: {
    script: 'shared/notion.js',
    description: 'Notion API connection',
  },
};

export function register(program) {
  program
    .command('test')
    .description('Verify integrations with external systems')
    .argument('[integration]', Object.keys(TARGETS).join(' | '))
    .action((integration) => {
      if (!integration) {
        console.log(chalk.bold('\nAvailable integrations\n'));
        for (const [id, { description }] of Object.entries(TARGETS)) {
          console.log(`  ${chalk.bold(id.padEnd(12))} ${description}`);
        }
        console.log(chalk.dim('\nRun: wingman test <integration>\n'));
        return;
      }

      const target = TARGETS[integration];
      if (!target) {
        console.error(`Unknown integration: ${integration}. Available: ${Object.keys(TARGETS).join(', ')}`);
        process.exit(1);
      }
      exec(target.script);
    });
}
