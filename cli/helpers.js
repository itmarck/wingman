import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function exec(script, args = []) {
  const child = spawn('node', [resolve(ROOT, script), ...args], {
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
  });
  child.on('close', (code) => process.exit(code ?? 0));
}
