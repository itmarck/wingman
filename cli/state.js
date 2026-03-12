import { readFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import chalk from 'chalk';
import { ROOT } from './helpers.js';

const STATE = resolve(ROOT, 'state');
const FILES = {
  email: 'email-seen.json',
  trending: 'reddit-trending.json',
  scheduler: 'scheduler.json',
};

async function showOverview() {
  for (const [name, file] of Object.entries(FILES)) {
    try {
      const data = JSON.parse(await readFile(resolve(STATE, file), 'utf8'));
      const size = Array.isArray(data) ? data.length : Object.keys(data).length;
      console.log(chalk.bold(name.padEnd(12)), `${size} entries`, chalk.dim(`(${file})`));
    } catch {
      console.log(chalk.bold(name.padEnd(12)), chalk.dim('not found'));
    }
  }
}

export function register(program) {
  const cmd = program.command('state').description('State inspection and management');

  cmd
    .command('show', { isDefault: true })
    .description('Overview of all state files')
    .action(showOverview);

  cmd
    .command('clear')
    .description('Delete state files')
    .argument('<target>', 'email | trending | scheduler | all')
    .action(async (target) => {
      const targets = target === 'all' ? Object.keys(FILES) : [target];
      for (const t of targets) {
        const file = FILES[t];
        if (!file) {
          console.error(`Unknown: ${t}. Use: ${Object.keys(FILES).join(', ')}, all`);
          continue;
        }
        try {
          await unlink(resolve(STATE, file));
          console.log(chalk.green('✓'), `Deleted ${file}`);
        } catch {
          console.log(chalk.dim(`${file} not found`));
        }
      }
    });
}
