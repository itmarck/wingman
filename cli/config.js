import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { ROOT } from './helpers.js';

const FILES = {
  profile: 'config/profile.md',
  goals: 'config/goals.md',
  sources: 'config/sources.json',
};

export function register(program) {
  const cmd = program.command('config').description('Configuration management');

  cmd
    .command('show')
    .description('Print summary of all config files')
    .action(async () => {
      for (const [name, file] of Object.entries(FILES)) {
        try {
          const content = await readFile(resolve(ROOT, file), 'utf8');
          const lines = content.split('\n').length;
          console.log(chalk.bold(name.padEnd(10)), chalk.dim(`(${file})`), `${lines} lines`);
          if (name === 'sources') {
            const data = JSON.parse(content);
            console.log(`  RSS: ${data.rss?.length || 0} feeds, Reddit: ${data.reddit?.subreddits?.length || 0} subs`);
          }
        } catch {
          console.log(chalk.bold(name.padEnd(10)), chalk.dim('not found'));
        }
      }
    });

  cmd
    .command('edit')
    .description('Open config file in $EDITOR')
    .argument('<name>', Object.keys(FILES).join(' | '))
    .action((name) => {
      const file = FILES[name];
      if (!file) {
        console.error(`Unknown config: ${name}. Use: ${Object.keys(FILES).join(', ')}`);
        process.exit(1);
      }
      const editor = process.env.EDITOR || 'notepad';
      spawn(editor, [resolve(ROOT, file)], { stdio: 'inherit', shell: true, windowsHide: true });
    });
}
