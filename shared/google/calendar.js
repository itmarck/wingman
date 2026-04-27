/**
 * Google Calendar API — minimal wrapper used by agents.
 *
 * All requests go through `googleFetch` so auth/refresh is handled centrally.
 * To add a new API surface (Drive, Tasks, Gmail), create another file here
 * that does the same thing for its endpoints.
 */

import { createLogger } from '../logger.js';
import { googleFetch } from './auth.js';

const log = createLogger('gcal');

const API_BASE = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_TZ = process.env.GOOGLE_CALENDAR_TZ || 'America/Lima';
const DEFAULT_CAL = process.env.GOOGLE_CALENDAR_ID || 'primary';

/**
 * Create an event.
 *
 * @param {object} input
 * @param {string} input.title
 * @param {string} [input.description]
 * @param {string} input.startIso  ISO 8601 datetime with offset
 * @param {string} [input.endIso]  ISO 8601 datetime; defaults to startIso + durationMinutes
 * @param {number} [input.durationMinutes=30]
 * @param {string} [input.calendarId=primary]
 * @returns {Promise<{id: string, htmlLink: string}>}
 */
export async function createEvent({
  title,
  description = '',
  startIso,
  endIso,
  durationMinutes = 30,
  calendarId = DEFAULT_CAL,
}) {
  if (!title || !startIso) {
    throw new Error('createEvent requires { title, startIso }');
  }

  const start = new Date(startIso);
  if (isNaN(start.getTime())) throw new Error(`Invalid startIso: ${startIso}`);

  const end = endIso
    ? new Date(endIso)
    : new Date(start.getTime() + durationMinutes * 60_000);

  const body = {
    summary: title,
    description,
    start: { dateTime: start.toISOString(), timeZone: DEFAULT_TZ },
    end: { dateTime: end.toISOString(), timeZone: DEFAULT_TZ },
  };

  log.verb(`POST /calendars/${calendarId}/events — "${title}" @ ${start.toISOString()}`);

  const res = await googleFetch(
    `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  const data = await res.json();
  log.ok(`Event created: "${title}" → ${data.id}`);
  return { id: data.id, htmlLink: data.htmlLink };
}

/**
 * List upcoming events from now to `daysAhead` from now.
 * Useful for inbox enrichment / morning digest.
 */
export async function listUpcomingEvents({ daysAhead = 7, calendarId = DEFAULT_CAL } = {}) {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 86_400_000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });

  const url = `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  log.verb(`GET ${url}`);

  const res = await googleFetch(url);
  const data = await res.json();
  return data.items || [];
}
