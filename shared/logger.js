import { appendFile, mkdir } from 'fs/promises';
import chalk from 'chalk';

const LOG_DIR = 'logs';
const TAG_WIDTH = 6;
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
  clock: chalk.blue,
  sched: chalk.blue,
  email: chalk.cyan,
  trends: chalk.magenta,
  claude: chalk.yellow,
  slack: chalk.green,
  auth: chalk.red,
};

function colorTag(id) {
  const tag = id.trim();
  const colorFn = TAG_COLORS[tag] || chalk.white;
  return colorFn(id);
}

const LEVEL_STYLE = {
  INFO: { symbol: '✓', color: chalk.green },
  WARN: { symbol: '⚠', color: chalk.yellow },
  ERROR: { symbol: '✗', color: chalk.red },
  VERBOSE: { symbol: '·', color: chalk.gray },
};

export function createLogger(tag) {
  const id = tag.slice(0, TAG_WIDTH).padEnd(TAG_WIDTH);

  const fileLine = (level, msg) => `[${utcTimestamp()}] [${id}] ${level} ${msg}`;

  function termPrint(level, msg) {
    const style = LEVEL_STYLE[level];
    const time = chalk.gray(localTime());
    const sym = style.color(style.symbol);
    const tagStr = colorTag(id);
    const text = level === 'ERROR' ? chalk.red(msg) : level === 'WARN' ? chalk.yellow(msg) : msg;
    const line = `${sym} ${time} ${chalk.gray('[')}${tagStr}${chalk.gray(']')} ${text}`;

    if (level === 'ERROR') {
      console.error(line);
    } else if (level === 'WARN') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    info(msg) {
      termPrint('INFO', msg);
      writeToFile(fileLine('INFO', msg));
    },

    warn(msg) {
      termPrint('WARN', msg);
      writeToFile(fileLine('WARN', msg));
    },

    error(msg) {
      termPrint('ERROR', msg);
      writeToFile(fileLine('ERROR', msg));
    },

    verbose(msg) {
      writeToFile(fileLine('VERBOSE', msg));
    },
  };
}
