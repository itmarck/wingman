import { appendFile, mkdir } from 'fs/promises';
import chalk from 'chalk';

const LOG_DIR = 'logs';
const TAG_WIDTH = 4;
let dirReady = false;

// Write queue to guarantee log line ordering.
// All writes are serialized through this queue so that
// fire-and-forget calls from sync code land in the correct order.
let writeChain = Promise.resolve();

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

function enqueueWrite(filePath, content) {
  writeChain = writeChain.then(async () => {
    try {
      await ensureDir();
      await appendFile(filePath, content);
    } catch {
      // Never crash the agent over a log write failure
    }
  });
}

function writeToFile(line) {
  enqueueWrite(`${LOG_DIR}/${todayUTC()}.log`, line + '\n');
}

function writeToSummary(line) {
  enqueueWrite(`${LOG_DIR}/output.log`, line + '\n');
}

/**
 * Wait for all pending log writes to complete.
 * Call before process.exit() to ensure nothing is lost.
 */
export async function flushLogs() {
  await writeChain;
}

const TAG_COLORS = {
  main: chalk.blue,
  mail: chalk.cyan,
  trnd: chalk.magenta,
  clde: chalk.yellow,
  slck: chalk.green,
  auth: chalk.red,
};

// Level definitions
// symbol: visual prefix in file
// label: 4-char text written to file for filtering
// color: terminal color
// termFn: console method (null = file-only)
const LEVELS = {
  TICK: { symbol: '━', label: 'tick', color: chalk.blue,   termFn: 'log' },
  HEAD: { symbol: '▸', label: 'head', color: chalk.white,  termFn: 'log' },
  INFO: { symbol: ' ', label: 'info', color: chalk.gray,   termFn: 'log' },
  OK:   { symbol: '✓', label: 'ok  ', color: chalk.green,  termFn: 'log' },
  WARN: { symbol: '⚠', label: 'warn', color: chalk.yellow, termFn: 'warn' },
  ERROR:{ symbol: '✗', label: 'err ', color: chalk.red,    termFn: 'error' },
  VERB: { symbol: '·', label: 'verb', color: chalk.gray,   termFn: null },
  DATA: { symbol: '·', label: 'data', color: chalk.gray,   termFn: null },
};

/**
 * Format a depth number as 2-digit string: 0 → "00", 1 → "01", etc.
 */
function depthStr(depth) {
  return String(depth).padStart(2, '0');
}

export function createLogger(tag) {
  const id = tag.slice(0, TAG_WIDTH).padEnd(TAG_WIDTH);
  const tagColor = TAG_COLORS[id.trim()] || chalk.white;

  function fileLine(level, msg, depth = 0) {
    const def = LEVELS[level];
    const ts = utcTimestamp();
    const dd = depthStr(depth);

    if (level === 'TICK') {
      return `━━━ ${ts} ${msg} ${'━'.repeat(Math.max(0, 50 - msg.length))}`;
    }

    return `${def.symbol} ${ts} [${id}] ${def.label} ${dd} | ${msg}`;
  }

  function termPrint(level, msg, depth = 0) {
    const def = LEVELS[level];
    if (!def.termFn) return;

    if (level === 'TICK') {
      const bar = chalk.blue(`━━━ ${msg} ${'━'.repeat(Math.max(0, 60 - msg.length))}`);
      console[def.termFn](bar);
      return;
    }

    const time = chalk.gray(localTime());
    const sym = def.color(def.symbol);
    const tagStr = `${chalk.gray('[')}${tagColor(id)}${chalk.gray(']')}`;

    // Indent based on depth
    const indent = depth > 0 ? '  '.repeat(depth) : '';

    let text = indent + msg;
    if (level === 'ERROR') text = chalk.red(indent + msg);
    else if (level === 'WARN') text = chalk.yellow(indent + msg);
    else if (level === 'HEAD') text = chalk.white.bold(indent + msg);
    else if (level === 'OK') text = chalk.green(indent + msg);

    console[def.termFn](`${sym} ${time} ${tagStr} ${text}`);
  }

  function emit(level, msg, depth = 0) {
    termPrint(level, msg, depth);
    writeToFile(fileLine(level, msg, depth));
  }

  function emitFileOnly(level, msg, depth = 0) {
    writeToFile(fileLine(level, msg, depth));
  }

  /**
   * Write a JSON object to file as pretty-printed lines.
   * Each line gets its own log entry with depth+1 for the JSON body.
   * @param {string} level - VERB or DATA
   * @param {string} label - prefix text before the JSON
   * @param {object|string} value - the JSON object or raw string
   * @param {number} depth - base depth for the label line
   */
  function emitJson(level, label, value, depth = 0) {
    // Label line
    emitFileOnly(level, label, depth);

    // Pretty-print JSON body
    if (typeof value === 'object' && value !== null) {
      const lines = JSON.stringify(value, null, 2).split('\n');
      for (const line of lines) {
        emitFileOnly(level, `  ${line}`, depth + 1);
      }
    } else {
      // String value — write as-is, split by newlines
      const lines = String(value).split('\n');
      for (const line of lines) {
        emitFileOnly(level, `  ${line}`, depth + 1);
      }
    }
  }

  return {
    tick(msg) { emit('TICK', msg); },
    head(msg) { emit('HEAD', msg); },
    info(msg, depth = 0) { emit('INFO', msg, depth); },
    ok(msg, depth = 0) { emit('OK', msg, depth); },
    warn(msg, depth = 0) { emit('WARN', msg, depth); },
    error(msg, depth = 0) { emit('ERROR', msg, depth); },

    /**
     * verb — technical/internal details (file-only)
     * Use for: prompts, URLs, token refresh, internal decisions, stack traces
     * @param {string} msg
     * @param {number} depth
     */
    verb(msg, depth = 0) { emitFileOnly('VERB', msg, depth); },

    /**
     * data — concrete data payloads (file-only)
     * Use for: API responses, email lists, Reddit posts, JSON classifications
     * Accepts optional JSON object for pretty-printing.
     * @param {string} msg - label or plain text
     * @param {object|null} json - optional JSON to pretty-print
     * @param {number} depth
     */
    data(msg, json = null, depth = 0) {
      if (json !== null) {
        emitJson('DATA', msg, json, depth);
      } else {
        emitFileOnly('DATA', msg, depth);
      }
    },

    /**
     * json — shorthand for verb with pretty-printed JSON (file-only)
     * Use for: logging prompts, raw Claude responses, technical payloads
     * @param {string} label
     * @param {object|string} value
     * @param {number} depth
     */
    verbJson(label, value, depth = 0) {
      emitJson('VERB', label, value, depth);
    },

    /**
     * summary — writes a one-line tick summary to output.log
     * Called from main.js at the end of each tick.
     * @param {string} msg
     */
    summary(msg) {
      const ts = new Date().toLocaleString('sv-SE', { hour12: false }).replace(',', '');
      writeToSummary(`${ts} ${msg}`);
    },
  };
}
