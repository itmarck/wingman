// Compat shim — forwards to shared/ai/index.ts.
// New code should import from './ai/index.js' directly.
export { classify, classifyRaw, summarize } from './ai/index.js';
