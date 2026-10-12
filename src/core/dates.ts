import * as chrono from 'chrono-node';
import { dayValid, Problem } from './model.js';

/** The timezone is an IANA zone accepted by the runtime. */
export function timezoneValid(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

/** Minutes the zone is ahead of UTC at that instant. */
export function offsetMinutes(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return Math.round((local - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** The local calendar day (YYYY-MM-DD) of an instant. */
export function localDay(at: Date, timezone: string): string {
  return new Date(at.getTime() + offsetMinutes(timezone, at) * 60000).toISOString().slice(0, 10);
}

/** Add whole days to a YYYY-MM-DD day. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Parse a date or an instant with offset; a date means the start of that local day. */
export function instant(value: string, timezone: string): Date {
  const day = value.slice(0, 10);
  if (!dayValid(day)) throw new Problem(400, 'Invalid date');
  if (value.length > 10) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw new Problem(400, 'Invalid date');
    return parsed;
  }
  const midnight = Date.parse(`${day}T00:00:00Z`);
  return new Date(midnight - offsetMinutes(timezone, new Date(midnight)) * 60000);
}

/** The last instant of a local day. */
export function endOfDay(day: string, timezone: string): Date {
  return new Date(instant(addDays(day, 1), timezone).getTime() - 1000);
}

export type DetectedDates = { occurredAt?: Date; plannedFor?: string; dueAt?: Date };
const deadline = /(antes del?|hasta el|hasta|vence|para el|l[ií]mite|plazo)\s*$/i;

/**
 * Detect the first Spanish date in a capture: tasks get plannedFor (or dueAt after
 * deadline words), notes get occurredAt when the date is not in the future.
 */
export function detectDates(
  text: string,
  kind: string,
  now: Date,
  timezone: string,
): DetectedDates {
  const [found] = chrono.es.parse(
    text,
    { instant: now, timezone: offsetMinutes(timezone, now) },
    { forwardDate: kind === 'task' },
  );
  if (!found) return {};
  const date = found.start.date();
  const timed = found.start.isCertain('hour');
  const day = localDay(date, timezone);
  if (kind === 'note') {
    if (date.getTime() > now.getTime()) return {};
    return { occurredAt: timed ? date : instant(day, timezone) };
  }
  if (kind !== 'task') return {};
  if (deadline.test(text.slice(0, found.index)))
    return { dueAt: timed ? date : endOfDay(day, timezone) };
  return timed ? { plannedFor: day, dueAt: date } : { plannedFor: day };
}
