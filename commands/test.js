import chalk from 'chalk';
import { exec } from './lib/helpers.js';

const TARGETS = {
  slack: {
    script: 'lib/slack.js',
    description: 'Send a probe message to every configured Slack webhook',
    detail: 'Posts a short test payload to each webhook URL stored in state/slack.json (email_important, email_digest, news, logs, alerts) and prints which channels responded successfully.',
  },
  ai: {
    script: 'lib/ai/test.ts',
    description: 'Verify the active AI provider responds to a prompt',
    detail: 'Reads AI_PROVIDER (local | groq | claude) and runs a sample classification prompt end-to-end. Useful to confirm credentials and connectivity before running agents.',
  },
  notion: {
    script: 'lib/notion.js',
    description: 'Verify the Notion API token and root page access',
    detail: 'Calls the Notion API with the configured NOTION_TOKEN and confirms it can read the root page referenced by NOTION_ROOT_PAGE_ID.',
  },
};

export function register(program) {
  const cmd = program
    .command('test')
    .description('Verify integrations with external systems');

  for (const [id, entry] of Object.entries(TARGETS)) {
    cmd
      .command(id)
      .description(entry.description)
      .addHelpText('after', `\n${entry.detail}\n`)
      .action(() => exec(entry.script));
  }

  cmd.action(() => {
    console.log(chalk.bold('\nAvailable integrations\n'));
    for (const [id, { description }] of Object.entries(TARGETS)) {
      console.log(`  ${chalk.bold(id.padEnd(12))} ${description}`);
    }
    console.log(chalk.dim('\nRun: wingman test <integration>'));
    console.log(chalk.dim('Help: wingman test <integration> --help\n'));
  });
}
