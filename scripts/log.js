#!/usr/bin/env node

/**
 * Quick log viewer — npm run log [options]
 *
 * Usage:
 *   npm run log                    → today's full log (colorized)
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
  clock: chalk.blue,
  sched: chalk.blue,
  email: chalk.cyan,
  trends: chalk.magenta,
  claude: chalk.yellow,
  slack: chalk.green,
  auth: chalk.red,
};

const LEVEL_STYLE = {
  INFO: { symbol: '✓', color: chalk.green },
  WARN: { symbol: '⚠', color: chalk.yellow },
  ERROR: { symbol: '✗', color: chalk.red },
  VERBOSE: { symbol: '·', color: chalk.gray },
};

const LINE_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(.{6})\] (\w+) (.*)$/;
const JSON_RE = /\{[\s\S]*\}$/;
const CLASSIFICATION_RE = /→ (urgent|important|informational|noise) /;

function colorizeClassification(text) {
  return text
    .replace(/→ urgent /g, chalk.red('→ urgent '))
    .replace(/→ important /g, chalk.yellow('→ important '))
    .replace(/→ informational /g, chalk.blue('→ informational '))
    .replace(/→ noise /g, chalk.gray('→ noise '));
}

function formatLine(raw) {
  const match = raw.match(LINE_RE);
  if (!match) return raw;

  const [, timestamp, tagRaw, level, msg] = match;
  const localTime = utcToLocal(timestamp);
  const style = LEVEL_STYLE[level] || LEVEL_STYLE.INFO;
  const tag = tagRaw.trim();
  const tagColor = TAG_COLORS[tag] || chalk.white;

  const sym = style.color(style.symbol);
  const time = chalk.gray(localTime);
  const tagStr = `${chalk.gray('[')}${tagColor(tagRaw)}${chalk.gray(']')}`;

  let text = msg;

  if (level === 'ERROR') {
    text = chalk.red(msg);
  } else if (level === 'WARN') {
    text = chalk.yellow(msg);
  } else if (level === 'VERBOSE') {
    text = chalk.gray(msg);
  } else {
    text = colorizeClassification(msg);
  }

  // Detect inline JSON and format it
  const jsonMatch = msg.match(JSON_RE);
  if (jsonMatch && level === 'VERBOSE') {
    try {
      const jsonObj = JSON.parse(jsonMatch[0]);
      const prefix = msg.slice(0, msg.indexOf(jsonMatch[0]));
      const jsonFormatted = formatJson(jsonObj);
      text = chalk.gray(prefix) + '\n' + jsonFormatted;
    } catch {
      // Not valid JSON, keep as-is
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
  const match = raw.match(LINE_RE);
  if (!match) return null;

  const [, timestamp, tagRaw, level, msg] = match;
  if (level !== 'INFO') return null;

  const localTime = utcToLocal(timestamp);
  const tag = tagRaw.trim();
  const tagColor = TAG_COLORS[tag] || chalk.white;

  return `${chalk.gray(localTime)}  ${tagColor(tag)}  ${colorizeClassification(msg)}`;
}

// --- Args parsing ---

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
  if (args.includes('clock')) return 'clock';
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

    if (hideVerbose && raw.includes('] VERBOSE ')) continue;
    if (tagFilter && !raw.includes(`[${tagFilter}`)) continue;
    if (levelFilter && !raw.includes(`] ${levelFilter} `)) continue;

    if (classFilter) {
      if (!raw.includes(`→ ${classFilter}`)) continue;
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
