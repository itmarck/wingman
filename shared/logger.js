import { appendFile, mkdir } from 'fs/promises';

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

function localTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function writeToFile(line) {
  try {
    await ensureDir();
    await appendFile(`${LOG_DIR}/${todayUTC()}.log`, line + '\n');
  } catch {
    // Never crash the agent over a log write failure
  }
}

export function createLogger(tag) {
  const id = tag.slice(0, TAG_WIDTH).padEnd(TAG_WIDTH);

  const fileLine = (level, msg) => `[${utcTimestamp()}] [${id}] ${level} ${msg}`;
  const termLine = (level, msg) => `[${localTimestamp()}] [${id}] ${level} ${msg}`;

  return {
    info(msg) {
      console.log(termLine('INFO', msg));
      writeToFile(fileLine('INFO', msg));
    },

    warn(msg) {
      console.warn(termLine('WARN', msg));
      writeToFile(fileLine('WARN', msg));
    },

    error(msg) {
      console.error(termLine('ERROR', msg));
      writeToFile(fileLine('ERROR', msg));
    },

    verbose(msg) {
      writeToFile(fileLine('VERBOSE', msg));
    },
  };
}
