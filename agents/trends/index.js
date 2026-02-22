import 'dotenv/config';
import { readFile } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { summarize } from '../../shared/claude.js';
import { sendSlack, formatTrendsDigest } from '../../shared/slack.js';
import { fetchRSS } from './rss.js';
import { fetchReddit } from './reddit.js';

const log = createLogger('trnd');

const WEBHOOK_NEWS = process.env.SLACK_WEBHOOK_NEWS;
const WEBHOOK_LOGS = process.env.SLACK_WEBHOOK_LOGS;

async function loadSources() {
  const raw = await readFile('config/sources.json', 'utf-8');
  return JSON.parse(raw);
}

function buildPrompt(rssItems, redditItems, categories) {
  const lines = [
    'Eres mi curador personal de noticias. Resume los items más interesantes e importantes en un resumen matutino conciso.',
    'IMPORTANTE: Escribe todo el resumen en español. Usa inglés solo para nombres propios, marcas y términos técnicos sin equivalente natural en español.',
    `Enfócate en estas categorías de interés: ${categories.join(', ')}.`,
    '',
    'FORMATO — usa Slack mrkdwn (NO markdown estándar):',
    '- Negrita: *texto* (un solo asterisco)',
    '- Cursiva: _texto_',
    '- Links: <URL|texto> (ej: <https://example.com|leer más>)',
    '- Bullet points: • o -',
    '- Emojis para encabezados de sección (ej: 🤖 *IA & Tecnología*)',
    '- NO uses ##, ###, ---, **, ```, ni ningún otro markdown estándar',
    '- Separa secciones con una línea vacía',
    '',
    'LINKS: Cada item incluye su URL. Al mencionarlo en el resumen, incluye un link con <URL|texto corto> para que pueda abrirlo directamente desde Slack. Es clave que los items más relevantes tengan su link.',
    '',
    'FUENTES OFICIALES PERÚ: Los items de fuentes como Congreso, Presidencia, PCM, Poder Judicial, Tribunal Constitucional, SUNAT, Gob. Regional Lambayeque y Muni Chiclayo son normas y hechos oficiales, no noticias. Incluye solo lo que tenga impacto real (leyes aprobadas, decretos importantes, sentencias relevantes, cambios tributarios, obras/ordenanzas locales). Ignora trámites administrativos rutinarios (designaciones de personal, resoluciones de archivo, licencias individuales). Descríbelos como hechos concretos en lenguaje natural, idealmente en una línea.',
    '',
    'Máximo 2500 caracteres. Prioriza calidad sobre cantidad — omite lo que no aporte valor.',
    '',
  ];

  if (rssItems.length > 0) {
    lines.push('## RSS Feed Items', '');
    for (const item of rssItems) {
      lines.push(`- [${item.source}] ${item.title} → ${item.link}`);
      if (item.snippet) lines.push(`  ${item.snippet.slice(0, 150)}`);
    }
    lines.push('');
  }

  if (redditItems.length > 0) {
    lines.push('## Reddit Posts', '');
    for (const item of redditItems) {
      lines.push(`- [r/${item.subreddit}] ${item.title} (⬆ ${item.score}, 💬 ${item.num_comments}) → ${item.url}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function runTrendsDigest() {
  log.head('Trends digest cycle');

  const sources = await loadSources();

  const [rssItems, redditItems] = await Promise.all([
    fetchRSS(sources.rss || []),
    fetchReddit(sources.reddit || []),
  ]);

  const totalItems = rssItems.length + redditItems.length;

  if (totalItems === 0) {
    log.info('No items fetched from any source. Skipping digest');
    return { summary: 'digest: no items' };
  }

  log.info(`Total items: ${rssItems.length} RSS + ${redditItems.length} Reddit = ${totalItems}`);

  const prompt = buildPrompt(rssItems, redditItems, sources.interest_categories || []);
  log.info(`Calling Claude (${prompt.length} chars)...`);

  const digest = await summarize(prompt);
  log.info(`Digest generated (${digest.length} chars). Posting to Slack...`);

  await sendSlack(WEBHOOK_NEWS, formatTrendsDigest(digest));

  const summaryText = `digest: posted (${rssItems.length} RSS + ${redditItems.length} Reddit)`;
  log.ok(`Cycle done: ${rssItems.length} RSS + ${redditItems.length} Reddit → digest posted`);

  try {
    await sendSlack(WEBHOOK_LOGS, `[trends-agent] ${summaryText}`);
  } catch {
    // Don't fail the cycle over a log notification
  }

  return { summary: summaryText };
}

// Direct execution: npm run dev:trends
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  runTrendsDigest()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error(`Fatal error: ${err.message}`);
      process.exit(1);
    });
}
