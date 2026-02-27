// One-time setup: auto-start on login + start pm2.
// No admin required. Safe to re-run — skips steps already done.

import { execSync } from 'child_process';
import { mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Windows Wingman folder — runs on every login, no admin needed
const startupFolder = resolve(
  os.homedir(),
  'AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Wingman'
);
const vbsPath = resolve(startupFolder, 'Wingman.vbs');

// VBScript: waits 10s for system stability, then restarts pm2.
// Runs fully hidden via wscript.exe (no console window).
// WshShell.CurrentDirectory avoids path quoting issues.
const vbsContent = [
  'WScript.Sleep 10000',
  'Set WshShell = CreateObject("WScript.Shell")',
  `WshShell.CurrentDirectory = "${root}"`,
  'WshShell.Run "cmd /c npx pm2 delete wingman >nul 2>&1 & npx pm2 start ecosystem.config.cjs", 0, False',
  'Set WshShell = Nothing',
].join('\r\n') + '\r\n';

async function vbsOk() {
  try {
    const existing = await readFile(vbsPath, 'utf-8');
    return existing === vbsContent;
  } catch {
    return false;
  }
}

function pm2Ok() {
  try {
    const list = JSON.parse(
      execSync('npx pm2 jlist', { cwd: root, windowsHide: true, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    );
    return list.some(p => p.name === 'wingman');
  } catch {
    return false;
  }
}

const [vbsReady, pm2Ready] = await Promise.all([vbsOk(), Promise.resolve(pm2Ok())]);

if (vbsReady && pm2Ready) {
  console.log('✓ Already set up — auto-start is registered and wingman is running.');
  process.exit(0);
}

if (!vbsReady) {
  console.log('1. Writing auto-start entry to Wingman folder...');
  await mkdir(startupFolder, { recursive: true });
  await writeFile(vbsPath, vbsContent, 'utf-8');
  console.log(`   ✓ ${vbsPath}`);
} else {
  console.log('1. Auto-start entry already up to date, skipping.');
}

if (!pm2Ready) {
  console.log('2. Starting wingman via pm2...');
  try {
    execSync('npx pm2 delete wingman', { cwd: root, windowsHide: true, stdio: 'ignore' });
  } catch {}
  execSync('npx pm2 start ecosystem.config.cjs', { cwd: root, stdio: 'inherit' });
} else {
  console.log('2. Wingman already running in pm2, skipping.');
}

console.log('\nSetup complete. Wingman starts automatically on every login.');
