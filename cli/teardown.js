import { existsSync, unlinkSync, rmSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import os from 'os';

const IS_WIN = process.platform === 'win32';

export function register(program) {
  program
    .command('teardown')
    .description('Unconfigure system (stop pm2, remove autostart). Data preserved.')
    .action(() => {
      console.log(chalk.bold('\nWingman teardown\n'));

      // Stop pm2
      try {
        execSync('pm2 delete wingman', { stdio: 'pipe', windowsHide: true });
        console.log(chalk.green('✓'), 'Stopped pm2 process');
      } catch {
        console.log(chalk.dim('  pm2 process not running'));
      }

      // Remove autostart
      if (IS_WIN) {
        const dir = resolve(os.homedir(), 'AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Wingman');
        const vbs = resolve(dir, 'Wingman.vbs');
        if (existsSync(vbs)) {
          unlinkSync(vbs);
          try { rmSync(dir, { recursive: true }); } catch {}
          console.log(chalk.green('✓'), 'Removed Windows autostart');
        } else {
          console.log(chalk.dim('  Windows autostart not configured'));
        }
      } else {
        try {
          execSync('pm2 unstartup', { stdio: 'inherit' });
          console.log(chalk.green('✓'), 'Removed pm2 startup hook');
        } catch {
          console.log(chalk.dim('  pm2 startup hook not configured (may need sudo)'));
        }
      }

      console.log(chalk.green('\nTeardown complete.'), 'State and credentials preserved.\n');
    });
}
