import { exec } from './helpers.js';

export function register(program) {
  program
    .command('run')
    .description('Execute agents')
    .argument('[agent]', 'all | email | digest | trending | catchup | inbox')
    .action((agent) => {
      const args = agent ? [agent === 'all' ? '--force-all' : `--force-${agent}`] : [];
      exec('main.js', args);
    });
}
