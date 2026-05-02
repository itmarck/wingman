import { Daemon } from './daemon.js'
import { loadConfig } from './lib/env.js'
import { createLogger } from './lib/logger.js'

const log = createLogger('main')

loadConfig()

const daemon = new Daemon({
  tickIntervalMs: 5 * 60 * 1000, // 5 minutes
  emailIntervalMin: 15,
  trendingIntervalMin: 10,
  digestHour: 8,
  catchupHour: 8,
})

try {
  await daemon.initialize()
} catch (error) {
  log.error(`Initialization failed: ${error.message}`)
  log.verb(`Stack: ${error.stack}`)
  process.exit(1)
}

await daemon.run()
