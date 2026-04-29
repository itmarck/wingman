import { readFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import chalk from 'chalk';
import { ROOT } from './lib/helpers.js';

const STATE = resolve(ROOT, 'state');
const FILES = {
  email: 'email-seen.json',
  trending: 'reddit-trending.json',
  scheduler: 'scheduler.json',
  schema: 'notion-dbs.json',
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

async function resetState(target) {
  const targets = target === 'all' ? Object.keys(FILES) : [target];
  for (const id of targets) {
    const file = FILES[id];
    if (!file) {
      console.error(`Unknown: ${id}. Use: ${Object.keys(FILES).join(', ')}, all`);
      continue;
    }
    try {
      await unlink(resolve(STATE, file));
      console.log(chalk.green('✓'), `Deleted ${file}`);
    } catch {
      console.log(chalk.dim(`${file} not found`));
    }
  }
}

export function register(program) {
  const cmd = program.command('state').description('State inspection and reset');

  cmd
    .command('show', { isDefault: true })
    .description('Overview of all state files (entry counts)')
    .addHelpText('after', `\nReads each file in state/ (${Object.values(FILES).join(', ')}) and prints how many entries it contains. Credentials in state/secrets.json and state/slack.json are NOT shown here.\n`)
    .action(showOverview);

  cmd
    .command('reset')
    .description('Delete state files (credentials preserved)')
    .argument('<target>', `${Object.keys(FILES).join(' | ')} | all`)
    .addHelpText('after', `\nDeletes the selected state file (or all of them with "all"). Credentials in state/secrets.json and state/slack.json are never touched — re-run "wingman setup" to reconfigure those instead.\n\nTargets:\n${Object.entries(FILES).map(([id, file]) => `  ${id.padEnd(12)} ${file}`).join('\n')}\n`)
    .action(resetState);
}
