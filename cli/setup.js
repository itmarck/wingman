import { exec } from './helpers.js';

const SCRIPTS = {
  auth: 'agents/email/auth.js',
  schema: 'agents/tasks/schema.js',
};

export function register(program) {
  program
    .command('setup')
    .description('Setup and configuration')
    .argument('[subcommand]', 'auth | schema')
    .action((sub) => {
      if (sub && !SCRIPTS[sub]) {
        console.error(`Unknown: ${sub}. Use: ${Object.keys(SCRIPTS).join(', ')}`);
        process.exit(1);
      }
      exec(sub ? SCRIPTS[sub] : 'scripts/setup.js');
    });
}
