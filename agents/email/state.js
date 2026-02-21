import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

const STATE_FILE = 'state/email-seen.json';
const MAX_IDS = 1000;

export async function loadSeen() {
  try {
    const data = await readFile(STATE_FILE, 'utf-8');
    return new Set(JSON.parse(data));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return new Set();
    }
    throw err;
  }
}

export async function saveSeen(seenSet) {
  const ids = [...seenSet];
  // Keep only the most recent IDs to prevent unbounded growth
  const pruned = ids.slice(-MAX_IDS);

  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(pruned, null, 2));
}
