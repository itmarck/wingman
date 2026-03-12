import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import chalk from 'chalk';
import { ROOT } from './helpers.js';

const FLAG = resolve(ROOT, 'state/disabled');

function pm2(cmd) {
  try {
    execSync(`pm2 ${cmd} wingman`, { windowsHide: true, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function register(program) {
  program
    .command('stop')
    .description('Stop Wingman completely (survives restart)')
    .action(() => {
      pm2('stop');
      writeFileSync(FLAG, new Date().toISOString());
      console.log(chalk.yellow('\n⏸  Wingman stopped'));
      console.log(chalk.dim('   Run: wingman start  to resume\n'));
    });

  program
    .command('start')
    .description('Start Wingman')
    .action(() => {
      if (existsSync(FLAG)) unlinkSync(FLAG);
      pm2('start ecosystem.config.cjs') || pm2('restart');
      console.log(chalk.green('\n▶  Wingman running'));
      console.log(chalk.dim('   Run: wingman status  to verify\n'));
    });
}
