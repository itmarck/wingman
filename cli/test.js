import { exec } from './helpers.js';

const TARGETS = {
  slack: 'shared/slack.js',
  claude: 'shared/claude.js',
  notion: 'shared/notion.js',
};

export function register(program) {
  program
    .command('test')
    .description('Verify integrations')
    .argument('<integration>', Object.keys(TARGETS).join(' | '))
    .action((integration) => {
      const script = TARGETS[integration];
      if (!script) {
        console.error(`Unknown integration: ${integration}. Use: ${Object.keys(TARGETS).join(', ')}`);
        process.exit(1);
      }
      exec(script);
    });
}
