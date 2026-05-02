import { loadConfig } from './shared/env.js';
import { Daemon } from './daemon.js';

loadConfig();

const daemon = new Daemon({
  tickIntervalMs: 5 * 60 * 1000,
  emailIntervalMin: 15,
  trendingIntervalMin: 10,
  digestHour: 8,
  catchupHour: 8,
});

await daemon.initialize();
await daemon.run();
