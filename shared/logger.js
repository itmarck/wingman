import { appendFile, mkdir } from 'fs/promises';
import chalk from 'chalk';

const LOG_DIR = 'logs';
const TAG_WIDTH = 4;
let dirReady = false;

async function ensureDir() {
  if (!dirReady) {
    await mkdir(LOG_DIR, { recursive: true });
    dirReady = true;
  }
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function utcTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function localTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function writeToFile(line) {
  try {
    await ensureDir();
    await appendFile(`${LOG_DIR}/${todayUTC()}.log`, line + '\n');
  } catch {
    // Never crash the agent over a log write failure
  }
}

const TAG_COLORS = {
  main: chalk.blue,
  mail: chalk.cyan,
  trnd: chalk.magenta,
  clde: chalk.yellow,
  slck: chalk.green,
  auth: chalk.red,
};

const LEVEL_STYLE = {
  TICK:  { symbol: '━', color: chalk.blue, termFn: 'log' },
  HEAD:  { symbol: '▸', color: chalk.white, termFn: 'log' },
  INFO:  { symbol: ' ', color: chalk.gray, termFn: 'log' },
  OK:    { symbol: '✓', color: chalk.green, termFn: 'log' },
  WARN:  { symbol: '⚠', color: chalk.yellow, termFn: 'warn' },
  ERROR: { symbol: '✗', color: chalk.red, termFn: 'error' },
  DATA:  { symbol: '·', color: chalk.gray, termFn: null },
};

export function createLogger(tag) {
  const id = tag.slice(0, TAG_WIDTH).padEnd(TAG_WIDTH);
  const tagColor = TAG_COLORS[id.trim()] || chalk.white;

  function fileLine(level, msg) {
    const style = LEVEL_STYLE[level];
    const ts = utcTimestamp();

    if (level === 'TICK') {
      return `━━━ ${ts} ${msg} ${'━'.repeat(Math.max(0, 50 - msg.length))}`;
    }

    return `${style.symbol} ${ts} [${id}] ${msg}`;
  }

  function termPrint(level, msg) {
    const style = LEVEL_STYLE[level];
    if (!style.termFn) return;

    if (level === 'TICK') {
      const bar = chalk.blue(`━━━ ${msg} ${'━'.repeat(Math.max(0, 60 - msg.length))}`);
      console[style.termFn](bar);
      return;
    }

    const time = chalk.gray(localTime());
    const sym = style.color(style.symbol);
    const tagStr = `${chalk.gray('[')}${tagColor(id)}${chalk.gray(']')}`;

    let text = msg;
    if (level === 'ERROR') text = chalk.red(msg);
    else if (level === 'WARN') text = chalk.yellow(msg);
    else if (level === 'HEAD') text = chalk.white.bold(msg);
    else if (level === 'OK') text = chalk.green(msg);

    console[style.termFn](`${sym} ${time} ${tagStr} ${text}`);
  }

  function emit(level, msg) {
    termPrint(level, msg);
    writeToFile(fileLine(level, msg));
  }

  return {
    tick(msg)  { emit('TICK', msg); },
    head(msg)  { emit('HEAD', msg); },
    info(msg)  { emit('INFO', msg); },
    ok(msg)    { emit('OK', msg); },
    warn(msg)  { emit('WARN', msg); },
    error(msg) { emit('ERROR', msg); },
    data(msg)  { writeToFile(fileLine('DATA', msg)); },
  };
}
