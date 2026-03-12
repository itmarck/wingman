import chalk from 'chalk';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { readSettings, writeSetting } from '../shared/env.js';
import { ROOT } from './helpers.js';

const FILES = {
  profile: 'config/profile.md',
  goals: 'config/goals.md',
  sources: 'config/sources.json',
};

const SETTINGS = {
  email_lookback_hours: { description: 'Email lookback hours', default: 1 },
  reddit_trending_threshold: { description: 'Reddit trending threshold', default: 500 },
  reddit_trending_viral: { description: 'Reddit viral threshold', default: 5000 },
};

export function register(program) {
  const cmd = program.command('config').description('Configuration management');

  cmd
    .command('show')
    .description('Print summary of config files and settings')
    .action(async () => {
      console.log(chalk.bold('\nFiles'));
      for (const [name, file] of Object.entries(FILES)) {
        try {
          const content = await readFile(resolve(ROOT, file), 'utf8');
          console.log(`  ${chalk.bold(name.padEnd(10))} ${content.split('\n').length} lines ${chalk.dim(`(${file})`)}`);
          if (name === 'sources') {
            const data = JSON.parse(content);
            console.log(`    RSS: ${data.rss?.length || 0} feeds, Reddit: ${data.reddit?.subreddits?.length || 0} subs`);
          }
        } catch {
          console.log(`  ${chalk.bold(name.padEnd(10))} ${chalk.dim('not found')}`);
        }
      }

      const settings = await readSettings();
      console.log(chalk.bold('\nSettings'));
      for (const [key, s] of Object.entries(SETTINGS)) {
        const value = settings[key] ?? s.default;
        console.log(`  ${chalk.bold(key.padEnd(30))} ${chalk.cyan(value)} ${chalk.dim(s.description)}`);
      }

      console.log(chalk.dim(`\nRun: wingman config set <key> <value>`));
      console.log(chalk.dim(`     wingman config edit <file>\n`));
    });

  cmd
    .command('edit')
    .description('Open config file in $EDITOR')
    .argument('<name>', Object.keys(FILES).join(' | '))
    .action((name) => {
      const file = FILES[name];
      if (!file) {
        console.error(`Unknown: ${name}. Use: ${Object.keys(FILES).join(', ')}`);
        process.exit(1);
      }
      const editor = process.env.EDITOR || 'notepad';
      spawn(editor, [resolve(ROOT, file)], { stdio: 'inherit', shell: true, windowsHide: true });
    });

  cmd
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', Object.keys(SETTINGS).join(' | '))
    .argument('<value>')
    .action(async (key, value) => {
      if (!SETTINGS[key]) {
        console.error(`Unknown: ${key}.\nAvailable: ${Object.keys(SETTINGS).join(', ')}`);
        process.exit(1);
      }
      await writeSetting(key, value);
      console.log(chalk.green('✓'), `${SETTINGS[key].description}: ${value}`);
    });

  cmd
    .command('get')
    .description('Get a configuration value')
    .argument('<key>', Object.keys(SETTINGS).join(' | '))
    .action(async (key) => {
      if (!SETTINGS[key]) {
        console.error(`Unknown: ${key}.\nAvailable: ${Object.keys(SETTINGS).join(', ')}`);
        process.exit(1);
      }
      const settings = await readSettings();
      console.log(settings[key] ?? SETTINGS[key].default);
    });
}
