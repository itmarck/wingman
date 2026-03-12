import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { ROOT } from './helpers.js';

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export function register(program) {
  program
    .command('status')
    .description('System overview')
    .action(async () => {
      // pm2
      console.log(chalk.bold('\npm2'));
      try {
        const out = execSync('pm2 jlist', { windowsHide: true, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        const wm = JSON.parse(out).find((p) => p.name === 'wingman');
        if (wm) {
          const { status, restart_time, pm_uptime } = wm.pm2_env;
          const color = status === 'online' ? chalk.green : chalk.red;
          const upMin = Math.round((Date.now() - pm_uptime) / 60000);
          console.log(`  ${color(status)}  restarts: ${restart_time}  uptime: ${upMin}min`);
        } else {
          console.log(chalk.yellow('  wingman not registered'));
        }
      } catch {
        console.log(chalk.dim('  pm2 not available'));
      }

      // Scheduler
      const sched = await readJson(resolve(ROOT, 'state/scheduler.json'));
      if (sched) {
        console.log(chalk.bold('\nLast runs'));
        for (const [key, val] of Object.entries(sched)) {
          if (!val) continue;
          const label = key.replace('last', '').replace('Tick', '');
          const ago = Math.round((Date.now() - new Date(val)) / 60000);
          console.log(`  ${label.padEnd(16)} ${ago}min ago`);
        }
      }

      // Counts
      const seen = await readJson(resolve(ROOT, 'state/email-seen.json'));
      if (seen) console.log(chalk.bold('\nEmail'), `${Array.isArray(seen) ? seen.length : 0} tracked`);

      const reddit = await readJson(resolve(ROOT, 'state/reddit-trending.json'));
      if (reddit) console.log(chalk.bold('Reddit'), `${Object.keys(reddit).length} notified today`);

      // Config
      try {
        const sources = JSON.parse(await readFile(resolve(ROOT, 'config/sources.json'), 'utf8'));
        const rss = sources.rss?.length || 0;
        const subs = sources.reddit?.subreddits?.length || 0;
        const interests = sources.reddit?.interest_categories?.length || 0;
        console.log(chalk.bold('\nConfig'), `${rss} RSS, ${subs} subreddits, ${interests} interests`);
      } catch {}

      console.log();
    });
}
