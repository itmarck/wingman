import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function exec(script, args = []) {
  const absolutePath = resolve(ROOT, script);
  const isTypeScript = absolutePath.endsWith('.ts');
  const runner = isTypeScript ? resolve(ROOT, 'node_modules/.bin/tsx') : 'node';
  const child = spawn(runner, [absolutePath, ...args], {
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
  });
  child.on('close', (code) => process.exit(code ?? 0));
}

export function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    }),
  );
}

export function openUrl(url) {
  spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true }).unref();
}
