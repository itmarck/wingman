import { readFile, writeFile, mkdir } from 'fs/promises';
import { createLogger, flushLogs } from './lib/logger.js';
import { initialize as initializeNotionDatabases } from './agents/tasks/database.js';

const log = createLogger('dmon');

const STATE_FILE = 'state/scheduler.json';

type SchedulerState = {
  lastEmailTick: string | null;
  lastDigest: string | null;
  lastRedditTrending: string | null;
  lastCatchup: string | null;
  lastInboxTick: string | null;
};

type AgentResult = { summary?: string } | undefined | void;
type AgentName = 'email' | 'catchup' | 'digest' | 'trending' | 'inbox';

export type DaemonConfig = {
  tickIntervalMs: number;
  emailIntervalMin: number;
  trendingIntervalMin: number;
  digestHour: number;
  catchupHour: number;
};

export class Daemon {
  private readonly config: DaemonConfig;
  private tickRunning = false;
  private tickInterval?: ReturnType<typeof setInterval>;

  constructor(config: DaemonConfig) {
    this.config = config;
  }

  /**
   * One-time startup: validate / create Notion databases and cache IDs in memory.
   * Must be called before run().
   */
  async initialize(): Promise<void> {
    log.head('Initializing databases');
    await initializeNotionDatabases();
    log.ok('Databases ready');
  }

  /**
   * Start the tick loop. Fires the first tick immediately, then every
   * config.tickIntervalMs. Handles SIGINT / SIGTERM gracefully.
   */
  async run(): Promise<void> {
    log.info(`Loop mode — tick every ${this.config.tickIntervalMs / 60_000} min`);

    await this.safeTick();
    this.tickInterval = setInterval(() => this.safeTick(), this.config.tickIntervalMs);

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, async () => {
        log.info(`${signal} received — shutting down`);
        clearInterval(this.tickInterval);
        await flushLogs();
        process.exit(0);
      });
    }
  }

  private async safeTick(): Promise<void> {
    if (this.tickRunning) {
      log.warn('Previous tick still running — skipping');
      return;
    }
    this.tickRunning = true;
    try {
      await this.tick();
    } catch (error: any) {
      log.error(`Tick error: ${error.message}`);
    } finally {
      await flushLogs();
      this.tickRunning = false;
    }
  }

  private async tick(): Promise<void> {
    const state = await this.loadState();
    const now = new Date();

    log.tick(`Tick at ${now.toLocaleTimeString()}`);

    const plan = this.buildPlan(state);
    log.info(`Agents: ${plan.join(', ')}`);

    const summaryParts: string[] = [];

    for (const agent of plan) {
      try {
        const result = await this.runAgent(agent, now, state);
        summaryParts.push((result as any)?.summary ?? `${agent}: done`);
      } catch (error: any) {
        log.error(`Agent "${agent}" failed: ${error.message}`);
        log.verb(`Agent "${agent}" stack: ${error.stack}`);
        summaryParts.push(`${agent}: FAILED`);
      }
    }

    await this.saveState(state);
    log.ok(`Tick complete — ran: ${plan.join(', ')}`);
    log.summary(`Tick — ${summaryParts.join(', ')}`);
  }

  private buildPlan(state: SchedulerState): AgentName[] {
    const plan: AgentName[] = [];
    if (this.shouldRunCatchup(state)) plan.push('catchup');
    else if (this.shouldRunEmail(state)) plan.push('email');
    if (this.shouldRunDigest(state)) plan.push('digest');
    if (this.shouldRunTrending(state)) plan.push('trending');
    plan.push('inbox');
    return plan;
  }

  private async runAgent(agent: AgentName, now: Date, state: SchedulerState): Promise<AgentResult> {
    switch (agent) {
      case 'email': {
        const { runEmailAgent } = await import('./agents/email/index.js');
        const result = await runEmailAgent();
        state.lastEmailTick = now.toISOString();
        return result;
      }
      case 'catchup': {
        const { runEmailCatchup } = await import('./agents/email/index.js');
        const result = await runEmailCatchup();
        state.lastEmailTick = now.toISOString();
        state.lastCatchup = now.toISOString().slice(0, 10);
        return result;
      }
      case 'digest': {
        const { runTrendsDigest } = await import('./agents/trends/index.js');
        const result = await runTrendsDigest();
        state.lastDigest = now.toISOString().slice(0, 10);
        return result;
      }
      case 'trending': {
        const { runRedditTrending } = await import('./agents/trends/trending.js');
        const result = await runRedditTrending();
        state.lastRedditTrending = now.toISOString();
        return result;
      }
      case 'inbox': {
        const { runInboxAgent } = await import('./agents/tasks/inbox.js');
        const result = await runInboxAgent();
        state.lastInboxTick = now.toISOString();
        return result;
      }
    }
  }

  private minutesSince(isoString: string | null): number {
    if (!isoString) return Infinity;
    return (Date.now() - new Date(isoString).getTime()) / 60_000;
  }

  private shouldRunEmail(state: SchedulerState): boolean {
    return this.minutesSince(state.lastEmailTick) >= this.config.emailIntervalMin;
  }

  private shouldRunDigest(state: SchedulerState): boolean {
    const now = new Date();
    if (now.getHours() < this.config.digestHour) return false;
    return state.lastDigest !== now.toISOString().slice(0, 10);
  }

  private shouldRunTrending(state: SchedulerState): boolean {
    return this.minutesSince(state.lastRedditTrending) >= this.config.trendingIntervalMin;
  }

  private shouldRunCatchup(state: SchedulerState): boolean {
    const now = new Date();
    if (state.lastCatchup === now.toISOString().slice(0, 10)) return false;
    if (now.getHours() < this.config.catchupHour) return false;
    log.info('Morning catch-up — scanning for missed emails');
    return true;
  }

  private async loadState(): Promise<SchedulerState> {
    try {
      return JSON.parse(await readFile(STATE_FILE, 'utf-8'));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          lastEmailTick: null,
          lastDigest: null,
          lastRedditTrending: null,
          lastCatchup: null,
          lastInboxTick: null,
        };
      }
      throw error;
    }
  }

  private async saveState(state: SchedulerState): Promise<void> {
    await mkdir('state', { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  }
}
