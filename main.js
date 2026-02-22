import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { createLogger, flushLogs } from './shared/logger.js';

const log = createLogger('main');

const STATE_FILE = 'state/scheduler.json';

// Intervals in minutes
const EMAIL_INTERVAL = 15;
const TRENDING_INTERVAL = 10;
const DIGEST_HOUR = 8; // Local hour for morning digest
const CATCHUP_GAP = 60; // Minutes of inactivity that triggers catch-up

async function loadState() {
  try {
    const data = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { lastEmailTick: null, lastDigest: null, lastRedditTrending: null, lastCatchup: null };
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

function shouldRunCatchup(state, force) {
  if (force) return true;
  const gap = minutesSince(state.lastEmailTick);
  if (gap < CATCHUP_GAP) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastCatchup === today) return false;
  log.warn(`Detected ${Math.round(gap)} min gap since last email tick — triggering catch-up`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes('--force-all');
  const forceEmail = forceAll || args.includes('--force-email');
  const forceDigest = forceAll || args.includes('--force-digest');
  const forceTrending = forceAll || args.includes('--force-trending');
  const forceCatchup = forceAll || args.includes('--force-catchup');

  const state = await loadState();
  const now = new Date();

  log.tick(`Tick at ${now.toLocaleTimeString()}`);

  const plan = [];

  // TODO: Improve catchup invoke
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

main()
  .then(() => flushLogs())
  .then(() => process.exit(0))
  .catch(async (err) => {
    log.error(`Scheduler fatal error: ${err.message}`);
    await flushLogs();
    process.exit(1);
  });
