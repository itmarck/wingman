import { loadConfig } from './shared/env.js';
import { existsSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import { createLogger, flushLogs } from './shared/logger.js';

loadConfig();

if (existsSync('state/disabled')) process.exit(0);

const log = createLogger('main');

const STATE_FILE = 'state/scheduler.json';

// Intervals in minutes
const EMAIL_INTERVAL = 15;
const TRENDING_INTERVAL = 10;
const DIGEST_HOUR = 8; // Local hour for morning digest
const CATCHUP_HOUR = 8; // Local hour for morning catch-up (retry each tick until success)
const INBOX_INTERVAL = 30; // Process Notion inbox every 30 min

const DISABLE_INBOX = true;

async function loadState() {
  try {
    const data = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { lastEmailTick: null, lastDigest: null, lastRedditTrending: null, lastCatchup: null, lastInboxTick: null };
    }
    throw err;
  }
}

async function saveState(state) {
  await mkdir('state', { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function minutesSince(isoString) {
  if (!isoString) return Infinity;
  return (Date.now() - new Date(isoString).getTime()) / 60_000;
}

function shouldRunEmail(state, force) {
  if (force) return true;
  return minutesSince(state.lastEmailTick) >= EMAIL_INTERVAL;
}

function shouldRunDigest(state, force) {
  if (force) return true;
  const now = new Date();
  const localHour = now.getHours();
  const today = now.toISOString().slice(0, 10);

  if (localHour < DIGEST_HOUR) return false;
  if (state.lastDigest === today) return false;
  return true;
}

function shouldRunTrending(state, force) {
  if (force) return true;
  return minutesSince(state.lastRedditTrending) >= TRENDING_INTERVAL;
}

function shouldRunInbox(state, force) {
  if (DISABLE_INBOX) return false;
  if (force) return true;
  return minutesSince(state.lastInboxTick) >= INBOX_INTERVAL;
}

function shouldRunCatchup(state, force) {
  if (force) return true;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (state.lastCatchup === today) return false;
  if (now.getHours() < CATCHUP_HOUR) return false;
  log.info('Morning catch-up — scanning for missed emails');
  return true;
}

async function isGaming() {
  try {
    const config = JSON.parse(await readFile('config/games.json', 'utf-8'));
    const exes = config.executables.map(e => e.toLowerCase());
    const output = execSync('tasklist /FO CSV /NH', { encoding: 'utf-8', timeout: 5000, windowsHide: true });
    for (const line of output.split('\n')) {
      const match = line.match(/^"([^"]+)"/);
      if (match && exes.includes(match[1].toLowerCase())) {
        return match[1];
      }
    }
  } catch {
    // If tasklist fails or config missing, don't block
  }
  return null;
}

async function tick({ forceAll, forceEmail, forceDigest, forceTrending, forceCatchup, forceInbox }) {
  const state = await loadState();
  const now = new Date();

  log.tick(`Tick at ${now.toLocaleTimeString()}`);

  // Pause while gaming (bypass with --force-*)
  if (!forceAll) {
    const game = await isGaming();
    if (game) {
      log.info(`Gaming detected (${game}) — skipping tick`);
      log.summary(`Tick — paused (gaming: ${game})`);
      return;
    }
  }

  const plan = [];

  if (shouldRunCatchup(state, forceCatchup)) {
    plan.push('catchup');
  } else if (shouldRunEmail(state, forceEmail)) {
    plan.push('email');
  }
  if (shouldRunDigest(state, forceDigest)) {
    plan.push('digest');
  }
  if (shouldRunTrending(state, forceTrending)) {
    plan.push('trending');
  }
  if (shouldRunInbox(state, forceInbox)) {
    plan.push('inbox');
  }

  if (plan.length === 0) {
    log.info('Nothing to run this tick');
    log.summary('Tick — nothing to run');
    return;
  }

  log.info(`Agents: ${plan.join(', ')}${forceAll ? ' (forced)' : ''}`);

  const summaryParts = [];

  for (const agent of plan) {
    try {
      switch (agent) {
        case 'email': {
          const { runEmailAgent } = await import('./agents/email/index.js');
          const result = await runEmailAgent();
          state.lastEmailTick = now.toISOString();
          summaryParts.push(result?.summary || 'email: done');
          break;
        }
        case 'catchup': {
          const { runEmailCatchup } = await import('./agents/email/index.js');
          const result = await runEmailCatchup();
          state.lastEmailTick = now.toISOString();
          state.lastCatchup = now.toISOString().slice(0, 10);
          summaryParts.push(result?.summary || 'catchup: done');
          break;
        }
        case 'digest': {
          const { runTrendsDigest } = await import('./agents/trends/index.js');
          const result = await runTrendsDigest();
          state.lastDigest = now.toISOString().slice(0, 10);
          summaryParts.push(result?.summary || 'digest: done');
          break;
        }
        case 'trending': {
          const { runRedditTrending } = await import('./agents/trends/trending.js');
          const result = await runRedditTrending();
          state.lastRedditTrending = now.toISOString();
          summaryParts.push(result?.summary || 'trending: done');
          break;
        }
        case 'inbox': {
          const { runInboxAgent } = await import('./agents/tasks/inbox.js');
          const result = await runInboxAgent();
          state.lastInboxTick = now.toISOString();
          summaryParts.push(result?.summary || 'inbox: done');
          break;
        }
      }
    } catch (err) {
      log.error(`Agent "${agent}" failed: ${err.message}`);
      log.verb(`Agent "${agent}" stack: ${err.stack}`);
      summaryParts.push(`${agent}: FAILED`);
    }
  }

  await saveState(state);
  log.ok(`Tick complete — ran: ${plan.join(', ')}`);
  log.summary(`Tick — ${summaryParts.join(', ')}`);
}

function parseFlags() {
  const args = process.argv.slice(2);
  const forceAll = args.includes('--force-all');
  return {
    forceAll,
    forceEmail: forceAll || args.includes('--force-email'),
    forceDigest: forceAll || args.includes('--force-digest'),
    forceTrending: forceAll || args.includes('--force-trending'),
    forceCatchup: forceAll || args.includes('--force-catchup'),
    forceInbox: forceAll || args.includes('--force-inbox'),
  };
}

const TICK_MS = 5 * 60 * 1000;

async function runOnce() {
  await tick(parseFlags());
  await flushLogs();
}

async function runLoop() {
  // Long-lived process (Railway). Tick every 5 min until SIGTERM.
  const flags = parseFlags();
  log.info(`Loop mode — tick every ${TICK_MS / 60_000} min`);

  let running = false;
  const safeTick = async () => {
    if (running) {
      log.warn('Previous tick still running — skipping');
      return;
    }
    running = true;
    try { await tick(flags); }
    catch (err) { log.error(`Tick error: ${err.message}`); }
    finally {
      await flushLogs();
      running = false;
    }
  };

  await safeTick();
  const interval = setInterval(safeTick, TICK_MS);

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      log.info(`${sig} received — exiting loop`);
      clearInterval(interval);
      await flushLogs();
      process.exit(0);
    });
  }
}

const looping = process.env.WINGMAN_LOOP === '1';
(looping ? runLoop() : runOnce())
  .then(() => { if (!looping) process.exit(0); })
  .catch(async (err) => {
    log.error(`Scheduler fatal error: ${err.message}`);
    await flushLogs();
    process.exit(1);
  });
