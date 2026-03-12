// One-time setup: auto-start on login + start pm2.
// No admin required. Safe to re-run — skips steps already done.
// Cross-platform: Windows (VBScript) / Linux (pm2 startup).

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import os from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';

// ─── pm2 check (shared) ─────────────────────────────────────

function pm2Ok() {
  try {
    const list = JSON.parse(
      execSync('npx pm2 jlist', { cwd: root, windowsHide: true, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }),
    );
    return list.some((p) => p.name === 'wingman');
  } catch {
    return false;
  }
}

function startPm2() {
  console.log('  Starting wingman via pm2...');
  try {
    execSync('npx pm2 delete wingman', { cwd: root, windowsHide: true, stdio: 'ignore' });
  } catch {}
  execSync('npx pm2 start ecosystem.config.cjs', { cwd: root, stdio: 'inherit' });
}

// ─── Windows: VBScript in Startup folder ─────────────────────

const vbsDir = resolve(os.homedir(), 'AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Wingman');
const vbsPath = resolve(vbsDir, 'Wingman.vbs');
const vbsContent = [
  'WScript.Sleep 10000',
  'Set WshShell = CreateObject("WScript.Shell")',
  `WshShell.CurrentDirectory = "${root}"`,
  'WshShell.Run "cmd /c npx pm2 delete wingman >nul 2>&1 & npx pm2 start ecosystem.config.cjs", 0, False',
  'Set WshShell = Nothing',
].join('\r\n') + '\r\n';

async function setupWindows() {
  // 1. Auto-start VBScript
  let vbsReady = false;
  try {
    vbsReady = (await readFile(vbsPath, 'utf-8')) === vbsContent;
  } catch {}

  if (!vbsReady) {
    console.log('1. Writing auto-start entry...');
    await mkdir(vbsDir, { recursive: true });
    await writeFile(vbsPath, vbsContent, 'utf-8');
    console.log(`   ✓ ${vbsPath}`);
  } else {
    console.log('1. Auto-start entry already up to date.');
  }

  // 2. pm2
  if (!pm2Ok()) {
    console.log('2.');
    startPm2();
  } else {
    console.log('2. Wingman already running in pm2.');
  }
}

// ─── Linux: pm2 startup + save ───────────────────────────────

function pm2StartupConfigured() {
  try {
    const out = execSync('pm2 get pm2:autodump', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    // Also check if the startup hook is installed by looking for the dump file
    const dumpPath = resolve(os.homedir(), '.pm2/dump.pm2');
    return existsSync(dumpPath);
  } catch {
    return false;
  }
}

async function setupLinux() {
  // 1. pm2 startup
  console.log('1. Configuring pm2 startup...');
  try {
    // pm2 startup outputs the sudo command if needed
    execSync('pm2 startup', { cwd: root, stdio: 'inherit' });
    console.log('   ✓ pm2 startup configured');
  } catch {
    console.log('   ⚠ pm2 startup may need sudo — run the command printed above, then re-run this setup.');
  }

  // 2. Start pm2 + save
  if (!pm2Ok()) {
    console.log('2.');
    startPm2();
  } else {
    console.log('2. Wingman already running in pm2.');
  }

  // 3. Save process list for resurrection
  console.log('3. Saving pm2 process list...');
  execSync('pm2 save', { cwd: root, stdio: 'inherit' });
}

// ─── Main ────────────────────────────────────────────────────

if (IS_WIN) {
  await setupWindows();
} else {
  await setupLinux();
}

console.log('\nSetup complete. Wingman starts automatically on every login.');
