import { start } from './platform/runtime.js';

try {
  const stop = await start();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void stop().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    });
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
