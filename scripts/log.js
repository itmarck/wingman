#!/usr/bin/env node

/**
 * Quick log viewer — npm run log [options]
 *
 * Usage:
 *   npm run log                    → today's full log
 *   npm run log -- hoy             → today's full log
 *   npm run log -- ayer            → yesterday's full log
 *   npm run log -- oneline         → compact view (INFO only, short timestamp)
 *   npm run log -- ayer oneline    → yesterday compact
 *   npm run log -- urgente         → only urgent classifications
 *   npm run log -- noise           → only noise
 *   npm run log -- quiet           → hide verbose lines
 *   npm run log -- errores         → only errors
 *   npm run log -- email           → only email agent lines
 *   npm run log -- claude          → only claude lines
 *   npm run log -- slack           → only slack lines
 *   npm run log -- trends          → only trends agent lines
 */

import { readFile } from 'fs/promises';

const LOG_DIR = 'logs';

function dateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function utcToLocal(utcStr) {
  const d = new Date(utcStr + 'Z');
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function convertTimestamps(line) {
  return line.replace(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/, (_, ts) => `[${utcToLocal(ts)}]`);
}

const args = process.argv.slice(2).map((a) => a.toLowerCase());

let daysAgo = 0;
const dayWords = { hoy: 0, today: 0, ayer: 1, yesterday: 1 };
for (const arg of args) {
  if (arg in dayWords) daysAgo = dayWords[arg];
}

const oneline = args.includes('oneline') || args.includes('compact');
const hideVerbose = args.includes('noverbose') || args.includes('quiet');

const tagFilter = (() => {
  if (args.includes('email')) return 'email';
  if (args.includes('claude')) return 'claude';
  if (args.includes('slack')) return 'slack';
  if (args.includes('trends')) return 'trends';
  if (args.includes('auth')) return 'auth';
  return null;
})();

const levelFilter = (() => {
  if (args.includes('errores') || args.includes('errors')) return 'ERROR';
  return null;
})();

const classFilter = (() => {
  if (args.includes('urgente') || args.includes('urgent')) return 'urgent';
  if (args.includes('importante') || args.includes('important')) return 'important';
  if (args.includes('info') || args.includes('informational')) return 'informational';
  if (args.includes('noise') || args.includes('basura')) return 'noise';
  return null;
})();

const date = dateStr(daysAgo);
const file = `${LOG_DIR}/${date}.log`;

try {
  const content = await readFile(file, 'utf-8');
  const lines = content.split('\n');
  let printed = 0;

  for (const raw of lines) {
    if (!raw.trim()) continue;

    if (hideVerbose && raw.includes('] VERBOSE ')) continue;
    if (tagFilter && !raw.includes(`[${tagFilter}`)) continue;
    if (levelFilter && !raw.includes(`] ${levelFilter} `)) continue;

    if (classFilter) {
      if (!raw.includes(`→ ${classFilter} `)) continue;
    }

    const local = convertTimestamps(raw);

    if (oneline) {
      const match = local.match(/^\[(.+?)\] \[(.+?)\] INFO (.+)$/);
      if (!match) continue;

      const [, time, , msg] = match;
      const shortTime = time.slice(11);
      console.log(`${shortTime}  ${msg}`);
    } else {
      console.log(local);
    }

    printed++;
  }

  if (printed === 0) {
    const label = daysAgo === 0 ? 'hoy' : 'ayer';
    console.log(`No hay resultados${tagFilter ? ` para "${tagFilter}"` : ''}${classFilter ? ` (${classFilter})` : ''} ${label}.`);
  }
} catch (err) {
  if (err.code === 'ENOENT') {
    const label = daysAgo === 0 ? 'hoy' : daysAgo === 1 ? 'ayer' : date;
    console.log(`No hay logs de ${label} (${file})`);
  } else {
    throw err;
  }
}
