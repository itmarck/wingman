#!/usr/bin/env node

/**
 * Quick log viewer — npm run log [options]
 *
 * Usage:
 *   npm run log                    → today's full log (colorized)
 *   npm run log -- hoy             → today's full log
 *   npm run log -- ayer            → yesterday's full log
 *   npm run log -- oneline         → compact view (non-data lines, short)
 *   npm run log -- ayer oneline    → yesterday compact
 *   npm run log -- urgente         → only urgent classifications
 *   npm run log -- noise           → only noise
 *   npm run log -- quiet           → hide DATA lines
 *   npm run log -- errores         → only errors
 *   npm run log -- mail            → only mail agent lines
 *   npm run log -- clde            → only claude lines
 *   npm run log -- slck            → only slack lines
 *   npm run log -- trnd            → only trends agent lines
 */

import { readFile } from 'fs/promises';
import chalk from 'chalk';

const LOG_DIR = 'logs';

function dateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function utcToLocal(utcStr) {
  const d = new Date(utcStr + 'Z');
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const TAG_COLORS = {
  main: chalk.blue,
  mail: chalk.cyan,
  trnd: chalk.magenta,
  clde: chalk.yellow,
  slck: chalk.green,
  auth: chalk.red,
};

// Symbols used in log file format
const SYMBOL_MAP = {
  '━': { level: 'TICK', color: chalk.blue },
  '▸': { level: 'HEAD', color: chalk.white },
  ' ': { level: 'INFO', color: chalk.gray },
  '✓': { level: 'OK', color: chalk.green },
  '⚠': { level: 'WARN', color: chalk.yellow },
  '✗': { level: 'ERROR', color: chalk.red },
  '·': { level: 'DATA', color: chalk.gray },
};

// Match: symbol timestamp [tag ] message
// Examples:
//   ✓ 2026-02-22 00:43:00 [mail] Fetched 5 emails
//   · 2026-02-22 00:43:00 [clde] Classify prompt...
//   ━━━ 2026-02-22 00:43:00 Tick at 19:43:00 ━━━━━━━━━
const TICK_RE = /^━━━ (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (.+?)[\s━]*$/;
const LINE_RE = /^(.) (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(.{4})\] (.*)$/;
const JSON_RE = /\{[\s\S]*\}$/;
const CLASSIFICATION_RE = /→ (urgent|important|informational|noise) /;

function colorizeClassification(text) {
  return text
    .replace(/→ urgent /g, chalk.red('→ urgent '))
    .replace(/→ important /g, chalk.yellow('→ important '))
    .replace(/→ informational /g, chalk.blue('→ informational '))
    .replace(/→ noise /g, chalk.gray('→ noise '));
}

function parseLine(raw) {
  // Try TICK line first
  const tickMatch = raw.match(TICK_RE);
  if (tickMatch) {
    return { level: 'TICK', timestamp: tickMatch[1], tag: null, msg: tickMatch[2] };
  }

  // Try regular line
  const match = raw.match(LINE_RE);
  if (!match) return null;

  const [, symbol, timestamp, tag, msg] = match;
  const info = SYMBOL_MAP[symbol];
  if (!info) return null;

  return { level: info.level, timestamp, tag: tag.trim(), msg };
}

function formatLine(raw) {
  const parsed = parseLine(raw);
  if (!parsed) return raw;

  const { level, timestamp, tag, msg } = parsed;
  const localTime = utcToLocal(timestamp);

  // TICK: full-width blue separator bar
  if (level === 'TICK') {
    return chalk.blue(`━━━ ${localTime} ${msg} ${'━'.repeat(Math.max(0, 50 - msg.length))}`);
  }

  const info = Object.values(SYMBOL_MAP).find((s) => s.level === level) || SYMBOL_MAP[' '];
  const sym = info.color(Object.keys(SYMBOL_MAP).find((k) => SYMBOL_MAP[k].level === level) || ' ');
  const time = chalk.gray(localTime);
  const tagColor = TAG_COLORS[tag] || chalk.white;
  const tagStr = `${chalk.gray('[')}${tagColor(tag.padEnd(4))}${chalk.gray(']')}`;

  let text = msg;

  if (level === 'ERROR') {
    text = chalk.red(msg);
  } else if (level === 'WARN') {
    text = chalk.yellow(msg);
  } else if (level === 'HEAD') {
    text = chalk.white.bold(msg);
  } else if (level === 'OK') {
    text = chalk.green(msg);
  } else if (level === 'DATA') {
    text = chalk.gray(msg);
  } else {
    text = colorizeClassification(msg);
  }

  // Detect inline JSON in DATA lines and format in a box
  if (level === 'DATA') {
    const jsonMatch = msg.match(JSON_RE);
    if (jsonMatch) {
      try {
        const jsonObj = JSON.parse(jsonMatch[0]);
        const prefix = msg.slice(0, msg.indexOf(jsonMatch[0]));
        const jsonFormatted = formatJson(jsonObj);
        text = chalk.gray(prefix) + '\n' + jsonFormatted;
      } catch {
        // Not valid JSON, keep as-is
      }
    }
  }

  return `${sym} ${time} ${tagStr} ${text}`;
}

function formatJson(obj) {
  const lines = JSON.stringify(obj, null, 2).split('\n');
  const top = chalk.gray('  ┌─');
  const bottom = chalk.gray('  └─');
  const colored = lines.map((line) => {
    const indented = '  ' + chalk.gray('│ ') + colorizeJsonLine(line);
    return indented;
  });
  return [top, ...colored, bottom].join('\n');
}

function colorizeJsonLine(line) {
  return line
    .replace(/"([^"]+)":/g, (_, key) => chalk.cyan(`"${key}"`) + ':')
    .replace(/: "([^"]*)"/g, (_, val) => ': ' + chalk.green(`"${val}"`))
    .replace(/: (\d+)/g, (_, num) => ': ' + chalk.yellow(num))
    .replace(/: (true|false|null)/g, (_, val) => ': ' + chalk.magenta(val));
}

function formatOneline(raw) {
  const parsed = parseLine(raw);
  if (!parsed) return null;

  const { level, timestamp, tag, msg } = parsed;
  // In oneline mode, show HEAD, INFO, OK, WARN, ERROR — skip TICK and DATA
  if (level === 'DATA' || level === 'TICK') return null;

  const localTime = utcToLocal(timestamp);
  const tagColor = TAG_COLORS[tag] || chalk.white;

  const info = Object.values(SYMBOL_MAP).find((s) => s.level === level);
  const sym = info ? info.color(Object.keys(SYMBOL_MAP).find((k) => SYMBOL_MAP[k].level === level) || ' ') : ' ';

  let text = msg;
  if (level === 'ERROR') text = chalk.red(msg);
  else if (level === 'WARN') text = chalk.yellow(msg);
  else if (level === 'OK') text = chalk.green(msg);
  else if (level === 'HEAD') text = chalk.white.bold(msg);
  else text = colorizeClassification(msg);

  return `${sym} ${chalk.gray(localTime)}  ${tagColor(tag)}  ${text}`;
}

// --- Args parsing ---

const args = process.argv.slice(2).map((a) => a.toLowerCase());

let daysAgo = 0;
const dayWords = { hoy: 0, today: 0, ayer: 1, yesterday: 1 };
for (const arg of args) {
  if (arg in dayWords) daysAgo = dayWords[arg];
}

const oneline = args.includes('oneline') || args.includes('compact');
const hideData = args.includes('nodata') || args.includes('quiet');

const tagFilter = (() => {
  if (args.includes('mail') || args.includes('email')) return 'mail';
  if (args.includes('clde') || args.includes('claude')) return 'clde';
  if (args.includes('slck') || args.includes('slack')) return 'slck';
  if (args.includes('trnd') || args.includes('trends')) return 'trnd';
  if (args.includes('auth')) return 'auth';
  if (args.includes('main') || args.includes('clock')) return 'main';
  return null;
})();

const levelFilter = (() => {
  if (args.includes('errores') || args.includes('errors')) return 'ERROR';
  if (args.includes('warnings') || args.includes('warns')) return 'WARN';
  return null;
})();

const classFilter = (() => {
  if (args.includes('urgente') || args.includes('urgent')) return 'urgent';
  if (args.includes('importante') || args.includes('important')) return 'important';
  if (args.includes('info') || args.includes('informational')) return 'informational';
  if (args.includes('noise') || args.includes('basura')) return 'noise';
  return null;
})();

// --- Main ---

const date = dateStr(daysAgo);
const file = `${LOG_DIR}/${date}.log`;
const label = daysAgo === 0 ? 'hoy' : daysAgo === 1 ? 'ayer' : date;

try {
  const content = await readFile(file, 'utf-8');
  const lines = content.split('\n');
  let printed = 0;

  // Print header
  console.log(chalk.gray(`\n─── Wingman logs — ${date} (${label}) ───\n`));

  for (const raw of lines) {
    if (!raw.trim()) continue;

    const parsed = parseLine(raw);

    // Apply filters
    if (parsed) {
      if (hideData && parsed.level === 'DATA') continue;
      if (tagFilter && parsed.tag !== tagFilter) continue;
      if (levelFilter && parsed.level !== levelFilter) continue;
      if (classFilter && !raw.includes(`→ ${classFilter}`)) continue;
    }

    if (oneline) {
      const out = formatOneline(raw);
      if (!out) continue;
      console.log(out);
    } else {
      console.log(formatLine(raw));
    }

    printed++;
  }

  if (printed === 0) {
    console.log(chalk.yellow(`No hay resultados${tagFilter ? ` para "${tagFilter}"` : ''}${classFilter ? ` (${classFilter})` : ''} ${label}.`));
  }

  console.log('');
} catch (err) {
  if (err.code === 'ENOENT') {
    console.log(chalk.yellow(`\nNo hay logs de ${label} (${file})\n`));
  } else {
    throw err;
  }
}
