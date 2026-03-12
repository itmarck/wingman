import { unlink } from 'fs/promises';
import { resolve } from 'path';
import chalk from 'chalk';
import { ROOT } from './helpers.js';

const STATE = resolve(ROOT, 'state');
const FILES = ['email-seen.json', 'reddit-trending.json', 'scheduler.json', 'notion-dbs.json'];

export function register(program) {
  program
    .command('reset')
    .description('Clear all state data (email tracking, trending, scheduler, schema IDs)')
    .action(async () => {
      console.log(chalk.bold('\nWingman reset\n'));

      for (const file of FILES) {
        try {
          await unlink(resolve(STATE, file));
          console.log(chalk.green('✓'), `Deleted ${file}`);
        } catch {
          console.log(chalk.dim(`  ${file} not found`));
        }
      }

      console.log(chalk.green('\nReset complete.'), 'Credentials preserved.\n');
    });
}
