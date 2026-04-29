// Long-lived scheduler for Railway. Ticks every 5 min and decides which agents to run.
// For local one-shot execution, use the `wingman run <agent>` CLI instead.

import { loadConfig } from './shared/env.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { createLogger, flushLogs } from './shared/logger.js';

loadConfig();

const log = createLogger('main');

const STATE_FILE = 'state/scheduler.json';
const TICK_MS = 5 * 60 * 1000;

const EMAIL_INTERVAL = 15;
const TRENDING_INTERVAL = 10;
const DIGEST_HOUR = 8;
const CATCHUP_HOUR = 8;

type SchedulerState = {
  lastEmailTick: string | null;
  lastDigest: string | null;
  lastRedditTrending: string | null;
  lastCatchup: string | null;
  lastInboxTick: string | null;
};

type AgentResult = { summary?: string } | undefined | void;

type AgentName = 'email' | 'catchup' | 'digest' | 'trending' | 'inbox';

async function loadState(): Promise<SchedulerState> {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf-8'));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return { lastEmailTick: null, lastDigest: null, lastRedditTrending: null, lastCatchup: null, lastInboxTick: null };
    }
    throw error;
  }
}

async function saveState(state: SchedulerState): Promise<void> {
  await mkdir('state', { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function minutesSince(isoString: string | null): number {
  if (!isoString) return Infinity;
  return (Date.now() - new Date(isoString).getTime()) / 60_000;
}

function shouldRunEmail(state: SchedulerState): boolean {
  return minutesSince(state.lastEmailTick) >= EMAIL_INTERVAL;
}

function shouldRunDigest(state: SchedulerState): boolean {
  const now = new Date();
  if (now.getHours() < DIGEST_HOUR) return false;
  if (state.lastDigest === now.toISOString().slice(0, 10)) return false;
  return true;
}

function shouldRunTrending(state: SchedulerState): boolean {
  return minutesSince(state.lastRedditTrending) >= TRENDING_INTERVAL;
}

function shouldRunCatchup(state: SchedulerState): boolean {
  const now = new Date();
  if (state.lastCatchup === now.toISOString().slice(0, 10)) return false;
  if (now.getHours() < CATCHUP_HOUR) return false;
  log.info('Morning catch-up — scanning for missed emails');
  return true;
}

async function tick(): Promise<void> {
  const state = await loadState();
  const now = new Date();

  log.tick(`Tick at ${now.toLocaleTimeString()}`);

  const plan: AgentName[] = [];
  if (shouldRunCatchup(state)) plan.push('catchup');
  else if (shouldRunEmail(state)) plan.push('email');
  if (shouldRunDigest(state)) plan.push('digest');
  if (shouldRunTrending(state)) plan.push('trending');
  plan.push('inbox');

  log.info(`Agents: ${plan.join(', ')}`);

  const summaryParts: string[] = [];

  for (const agent of plan) {
    try {
      let result: AgentResult;
      switch (agent) {
        case 'email': {
          const { runEmailAgent } = await import('./agents/email/index.js');
          result = await runEmailAgent();
          state.lastEmailTick = now.toISOString();
          break;
        }
        case 'catchup': {
          const { runEmailCatchup } = await import('./agents/email/index.js');
          result = await runEmailCatchup();
          state.lastEmailTick = now.toISOString();
          state.lastCatchup = now.toISOString().slice(0, 10);
          break;
        }
        case 'digest': {
          const { runTrendsDigest } = await import('./agents/trends/index.js');
          result = await runTrendsDigest();
          state.lastDigest = now.toISOString().slice(0, 10);
          break;
        }
        case 'trending': {
          const { runRedditTrending } = await import('./agents/trends/trending.js');
          result = await runRedditTrending();
          state.lastRedditTrending = now.toISOString();
          break;
        }
        case 'inbox': {
          const { runInboxAgent } = await import('./agents/tasks/inbox.js');
          result = await runInboxAgent();
          state.lastInboxTick = now.toISOString();
          break;
        }
      }
      summaryParts.push((result as { summary?: string } | undefined)?.summary || `${agent}: done`);
    } catch (error: any) {
      log.error(`Agent "${agent}" failed: ${error.message}`);
      log.verb(`Agent "${agent}" stack: ${error.stack}`);
      summaryParts.push(`${agent}: FAILED`);
    }
  }

  await saveState(state);
  log.ok(`Tick complete — ran: ${plan.join(', ')}`);
  log.summary(`Tick — ${summaryParts.join(', ')}`);
}

log.info(`Loop mode — tick every ${TICK_MS / 60_000} min`);

let running = false;
const safeTick = async (): Promise<void> => {
  if (running) {
    log.warn('Previous tick still running — skipping');
    return;
  }
  running = true;
  try { await tick(); }
  catch (error: any) { log.error(`Tick error: ${error.message}`); }
  finally {
    await flushLogs();
    running = false;
  }
};

await safeTick();
const interval = setInterval(safeTick, TICK_MS);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    log.info(`${signal} received — exiting loop`);
    clearInterval(interval);
    await flushLogs();
    process.exit(0);
  });
}
