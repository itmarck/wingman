#!/usr/bin/env node

/**
 * Quick log viewer — npm run log [options]
 *
 * Usage:
 *   npm run log                    → today's full log (no verb/data)
 *   npm run log -- hoy             → today's full log
 *   npm run log -- ayer            → yesterday's full log
 *   npm run log -- oneline         → compact view (depth 00 only, no verb/data)
 *   npm run log -- ayer oneline    → yesterday compact
 *   npm run log -- verbose         → include verb lines
 *   npm run log -- data            → include data lines
 *   npm run log -- all             → include everything (verb + data)
 *   npm run log -- depth 0         → only depth 00 lines
 *   npm run log -- depth 1         → up to depth 01
 *   npm run log -- urgente         → only urgent classifications
 *   npm run log -- noise           → only noise
 *   npm run log -- errores         → only errors
 *   npm run log -- mail            → only mail agent lines
 *   npm run log -- clde            → only claude lines
 *   npm run log -- slck            → only slack lines
 *   npm run log -- trnd            → only trends agent lines
 *   npm run log -- summary         → show output.log (tick summaries)
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

// New format: SYMBOL TIMESTAMP [TAG ] LEVEL DD | MESSAGE
// Example:  ✓ 2026-02-22 16:10:22 [mail] ok   00 | Fetched 5 emails
const TICK_RE = /^━━━ (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (.+?)[\s━]*$/;
const LINE_RE = /^(.) (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(.{4})\] ([a-z ]{4}) (\d{2}) \| (.*)$/;

const LEVEL_COLORS = {
  head: { symbol: '▸', color: chalk.white },
  info: { symbol: ' ', color: chalk.gray },
  ok:   { symbol: '✓', color: chalk.green },
  warn: { symbol: '⚠', color: chalk.yellow },
  err:  { symbol: '✗', color: chalk.red },
  verb: { symbol: '·', color: chalk.gray },
  data: { symbol: '·', color: chalk.gray },
};

const CLASSIFICATION_RE = /-- (urgent|important|informational|noise)/;

function colorizeClassification(text) {
  return text
    .replace(/-- urgent/g, chalk.red('-- urgent'))
    .replace(/-- important/g, chalk.yellow('-- important'))
    .replace(/-- informational/g, chalk.blue('-- informational'))
    .replace(/-- noise/g, chalk.gray('-- noise'));
}

function parseLine(raw) {
  const tickMatch = raw.match(TICK_RE);
  if (tickMatch) {
    return { level: 'tick', timestamp: tickMatch[1], tag: null, depth: 0, msg: tickMatch[2] };
  }

  const match = raw.match(LINE_RE);
  if (!match) return null;

  const [, , timestamp, tag, level, depth, msg] = match;
  return {
    level: level.trim(),
    timestamp,
    tag: tag.trim(),
    depth: parseInt(depth, 10),
    msg,
  };
}

function colorizeJsonLine(line) {
  return line
    .replace(/"([^"]+)":/g, (_, key) => chalk.cyan(`"${key}"`) + ':')
    .replace(/: "([^"]*)"/g, (_, val) => ': ' + chalk.green(`"${val}"`))
    .replace(/: (\d+)/g, (_, num) => ': ' + chalk.yellow(num))
    .replace(/: (true|false|null)/g, (_, val) => ': ' + chalk.magenta(val));
}

function formatLine(parsed) {
  const { level, timestamp, tag, depth, msg } = parsed;
  const localTime = utcToLocal(timestamp);

  // TICK: full-width blue separator bar
  if (level === 'tick') {
    return chalk.blue(`\n━━━ ${localTime} ${msg} ${'━'.repeat(Math.max(0, 50 - msg.length))}`);
  }

  const def = LEVEL_COLORS[level] || LEVEL_COLORS.info;
  const sym = def.color(def.symbol);
  const tagColor = TAG_COLORS[tag] || chalk.white;
  const tagStr = `${chalk.gray('[')}${tagColor(tag.padEnd(4))}${chalk.gray(']')}`;

  // Indent based on depth
  const indent = depth > 0 ? '  '.repeat(depth) : '';

  let text = indent + msg;

  if (level === 'err') {
    text = chalk.red(indent + msg);
  } else if (level === 'warn') {
    text = chalk.yellow(indent + msg);
  } else if (level === 'head') {
    text = chalk.white.bold(indent + msg);
  } else if (level === 'ok') {
    text = chalk.green(indent + msg);
  } else if (level === 'verb') {
    text = chalk.gray(indent + msg);
  } else if (level === 'data') {
    // Data lines: colorize JSON content if it looks like JSON
    const trimmed = msg.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('}') || trimmed.startsWith('"') || trimmed.startsWith('[') || trimmed.startsWith(']')) {
      text = indent + colorizeJsonLine(msg);
    } else {
      text = chalk.white(indent + msg);
    }
  } else {
    text = colorizeClassification(indent + msg);
  }

  return `${sym} ${chalk.gray(localTime)} ${tagStr} ${text}`;
}

function formatOneline(parsed) {
  const { level, timestamp, tag, depth, msg } = parsed;
  // Oneline: only depth 00, skip tick/verb/data
  if (level === 'tick' || level === 'verb' || level === 'data') return null;
  if (depth > 0) return null;

  const localTime = utcToLocal(timestamp);
  const tagColor = TAG_COLORS[tag] || chalk.white;
  const def = LEVEL_COLORS[level] || LEVEL_COLORS.info;
  const sym = def.color(def.symbol);

  let text = msg;
  if (level === 'err') text = chalk.red(msg);
  else if (level === 'warn') text = chalk.yellow(msg);
  else if (level === 'ok') text = chalk.green(msg);
  else if (level === 'head') text = chalk.white.bold(msg);
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

const showSummary = args.includes('summary') || args.includes('resumen');
const oneline = args.includes('oneline') || args.includes('compact');
const showVerb = args.includes('verbose') || args.includes('verb') || args.includes('all');
const showData = args.includes('data') || args.includes('datos') || args.includes('all');

// Depth filter: --depth N or depth N
const depthFilter = (() => {
  const idx = args.indexOf('depth');
  if (idx >= 0 && args[idx + 1] !== undefined) {
    const n = parseInt(args[idx + 1], 10);
    if (!isNaN(n)) return n;
  }
  return null;
})();

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
  if (args.includes('errores') || args.includes('errors')) return 'err';
  if (args.includes('warnings') || args.includes('warns')) return 'warn';
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
const label = daysAgo === 0 ? 'hoy' : daysAgo === 1 ? 'ayer' : date;

// Summary mode: show output.log
if (showSummary) {
  try {
    const content = await readFile(`${LOG_DIR}/output.log`, 'utf-8');
    console.log(chalk.gray(`\n─── Wingman tick summary ───\n`));
    const lines = content.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      // Highlight key parts
      let colored = line;
      if (line.includes('nothing to run')) {
        colored = chalk.gray(line);
      } else {
        colored = line
          .replace(/(email:[^,)]+)/g, chalk.cyan('$1'))
          .replace(/(trending:[^,)]+)/g, chalk.magenta('$1'))
          .replace(/(digest[^,)]*)/g, chalk.yellow('$1'))
          .replace(/(catchup:[^,)]+)/g, chalk.blue('$1'));
      }
      console.log(colored);
    }
    console.log('');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(chalk.yellow(`\nNo hay summary log (${LOG_DIR}/output.log)\n`));
    } else {
      throw err;
    }
  }
  process.exit(0);
}

// Normal mode: show daily log
const file = `${LOG_DIR}/${date}.log`;

try {
  const content = await readFile(file, 'utf-8');
  const lines = content.split('\n');
  let printed = 0;

  console.log(chalk.gray(`\n─── Wingman logs — ${date} (${label}) ───\n`));

  for (const raw of lines) {
    if (!raw.trim()) continue;

    const parsed = parseLine(raw);
    if (!parsed) continue;

    // --- Filters ---

    // Hide verb/data by default unless explicitly requested
    if (parsed.level === 'verb' && !showVerb) continue;
    if (parsed.level === 'data' && !showData) continue;

    // Tag filter
    if (tagFilter && parsed.tag !== tagFilter && parsed.level !== 'tick') continue;

    // Level filter
    if (levelFilter && parsed.level !== levelFilter) continue;

    // Depth filter
    if (depthFilter !== null && parsed.depth > depthFilter) continue;

    // Classification filter
    if (classFilter && !raw.includes(`-- ${classFilter}`)) continue;

    // Render
    if (oneline) {
      const out = formatOneline(parsed);
      if (!out) continue;
      console.log(out);
    } else {
      console.log(formatLine(parsed));
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
