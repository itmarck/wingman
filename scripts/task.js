// Ad-hoc Notion task script. Not part of the wingman CLI — invoke directly:
//   tsx scripts/task.js list [--done] [--context <ctx>] [--goal <goal>]
//   tsx scripts/task.js add "<text>"
// Notion is normally managed from the web/app; this script only exists for
// quick terminal access when convenient.

import chalk from 'chalk';
import { loadConfig } from '../shared/env.js';
import { loadDbIds } from '../agents/tasks/schema.js';
import { queryDatabase, createPage, props } from '../shared/notion.js';

loadConfig();

function priorityColor(priority) {
  if (priority >= 76) return chalk.red;
  if (priority >= 51) return chalk.yellow;
  if (priority >= 26) return chalk.blue;
  return chalk.gray;
}

function extractTitle(page) {
  for (const property of Object.values(page.properties)) {
    if (property.type === 'title' && property.title.length > 0) {
      return property.title.map((token) => token.plain_text).join('');
    }
  }
  return '(sin titulo)';
}

function parseFlags(args) {
  const flags = { done: false, context: null, goal: null };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--done') flags.done = true;
    else if (arg === '--context') flags.context = args[++index];
    else if (arg === '--goal') flags.goal = args[++index];
  }
  return flags;
}

async function listTasks(args) {
  const flags = parseFlags(args);
  const dbIds = await loadDbIds();
  if (!dbIds.tasks) {
    console.error('No task DB found. Run: wingman setup schema');
    process.exit(1);
  }

  const filters = [];
  filters.push(flags.done
    ? { property: 'progress', number: { equals: 100 } }
    : { property: 'progress', number: { less_than: 100 } });
  if (flags.context) filters.push({ property: 'context', select: { equals: flags.context } });
  if (flags.goal) filters.push({ property: 'goal', select: { equals: flags.goal } });

  const filter = filters.length === 1 ? filters[0] : { and: filters };
  const pages = await queryDatabase(dbIds.tasks, filter, [{ property: 'priority', direction: 'descending' }]);

  if (!pages.length) {
    console.log(chalk.green('No tasks found.'));
    return;
  }

  for (const page of pages) {
    const title = extractTitle(page);
    const priority = page.properties.priority?.number ?? 0;
    const progress = page.properties.progress?.number ?? 0;
    const context = page.properties.context?.select?.name || '';
    const goal = page.properties.goal?.select?.name || '';
    const mark = progress === 100 ? chalk.green('✓') : progress > 0 ? chalk.yellow('▶') : chalk.gray('○');
    console.log(`${mark} ${priorityColor(priority)(`[P:${priority}]`)} ${title} ${chalk.dim(`${context} → ${goal}`)}`);
  }
}

async function addTask(args) {
  const text = args.join(' ').trim();
  if (!text) {
    console.error('Usage: tsx scripts/task.js add "<text>"');
    process.exit(1);
  }
  const dbIds = await loadDbIds();
  if (!dbIds.inbox) {
    console.error('No inbox DB found. Run: wingman setup schema');
    process.exit(1);
  }
  await createPage(dbIds.inbox, {
    name: props.title(text),
    source: props.select('cli'),
    status: props.select('received'),
  });
  console.log(chalk.green('✓'), 'Added to inbox:', text);
}

const [subcommand, ...rest] = process.argv.slice(2);

switch (subcommand) {
  case 'list':
    await listTasks(rest);
    break;
  case 'add':
    await addTask(rest);
    break;
  default:
    console.error('Usage: tsx scripts/task.js <list|add> [args...]');
    process.exit(1);
}
