import type { Database } from './storage.js';

/** Record a system event for analytics; failures are logged, never propagated. */
export function track(
  db: Database,
  type: string,
  data: Record<string, unknown>,
  durationMs?: number,
  onError: (error: unknown) => void = console.error,
): void {
  db.query('INSERT INTO telemetry.events (type, "durationMs", data) VALUES ($1,$2,$3)', [
    type,
    durationMs == null ? null : Math.round(durationMs),
    JSON.stringify(data),
  ]).catch(onError);
}
