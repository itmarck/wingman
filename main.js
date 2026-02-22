import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { createLogger } from './shared/logger.js';

const log = createLogger('clock');

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

  // Run once per day, after DIGEST_HOUR (local time)
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
  // Auto catch-up if the scheduler was offline for more than CATCHUP_GAP minutes
  const gap = minutesSince(state.lastEmailTick);
  if (gap < CATCHUP_GAP) return false;
  // Only catch-up once per gap (don't repeat if already caught up recently)
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastCatchup === today) return false;
  log.info(`Detected ${Math.round(gap)} min gap since last email tick — triggering catch-up`);
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

  log.info(`Tick at ${now.toLocaleTimeString()} — evaluating agents...`);

  const plan = [];

  // Catch-up runs INSTEAD of normal email when triggered
  const needsCatchup = shouldRunCatchup(state, forceCatchup);

  if (needsCatchup) {
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
    log.info('Nothing to run this tick.');
    return;
  }

  log.info(`Agents to run: ${plan.join(', ')}${forceAll ? ' (forced)' : ''}`);

  // Run agents sequentially to avoid overloading Claude
  for (const agent of plan) {
    try {
      switch (agent) {
        case 'email': {
          const { runEmailAgent } = await import('./agents/email/index.js');
          await runEmailAgent();
          state.lastEmailTick = now.toISOString();
          break;
        }
        case 'catchup': {
          const { runEmailCatchup } = await import('./agents/email/index.js');
          await runEmailCatchup();
          state.lastEmailTick = now.toISOString();
          state.lastCatchup = now.toISOString().slice(0, 10);
          break;
        }
        case 'digest': {
          const { runTrendsDigest } = await import('./agents/trends/index.js');
          await runTrendsDigest();
          state.lastDigest = now.toISOString().slice(0, 10);
          break;
        }
        case 'trending': {
          const { runRedditTrending } = await import('./agents/trends/trending.js');
          await runRedditTrending();
          state.lastRedditTrending = now.toISOString();
          break;
        }
      }
    } catch (err) {
      log.error(`Agent "${agent}" failed: ${err.message}`);
      log.verbose(`Agent "${agent}" stack: ${err.stack}`);
      // Continue with other agents even if one fails
    }
  }

  await saveState(state);
  log.info(`Tick complete. Ran: ${plan.join(', ')}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error(`Scheduler fatal error: ${err.message}`);
    process.exit(1);
  });
