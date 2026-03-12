import chalk from 'chalk';
import { loadDbIds } from '../agents/tasks/schema.js';
import { queryDatabase, createPage, props } from '../shared/notion.js';

function priorityColor(p) {
  if (p >= 76) return chalk.red;
  if (p >= 51) return chalk.yellow;
  if (p >= 26) return chalk.blue;
  return chalk.gray;
}

function extractTitle(page) {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === 'title' && prop.title.length > 0) return prop.title.map((t) => t.plain_text).join('');
  }
  return '(sin titulo)';
}

export function register(program) {
  const cmd = program.command('task').description('Task management');

  cmd
    .command('list')
    .description('List tasks')
    .option('--done', 'show completed tasks (progress = 100)')
    .option('--context <ctx>', 'filter: work, personal, family, brand')
    .option('--goal <goal>', 'filter: career, english, minima, automation')
    .action(async (opts) => {
      const dbIds = await loadDbIds();
      if (!dbIds.tasks) {
        console.error('No task DB found. Run: wingman setup schema');
        process.exit(1);
      }

      const filters = [];
      if (opts.done) filters.push({ property: 'progress', number: { equals: 100 } });
      else filters.push({ property: 'progress', number: { less_than: 100 } });
      if (opts.context) filters.push({ property: 'context', select: { equals: opts.context } });
      if (opts.goal) filters.push({ property: 'goal', select: { equals: opts.goal } });

      const filter = filters.length === 1 ? filters[0] : { and: filters };
      const pages = await queryDatabase(dbIds.tasks, filter, [{ property: 'priority', direction: 'descending' }]);

      if (!pages.length) {
        console.log(chalk.green('No tasks found.'));
        return;
      }

      for (const p of pages) {
        const title = extractTitle(p);
        const priority = p.properties.priority?.number ?? 0;
        const progress = p.properties.progress?.number ?? 0;
        const context = p.properties.context?.select?.name || '';
        const goal = p.properties.goal?.select?.name || '';
        const mark = progress === 100 ? chalk.green('✓') : progress > 0 ? chalk.yellow('▶') : chalk.gray('○');
        console.log(`${mark} ${priorityColor(priority)(`[P:${priority}]`)} ${title} ${chalk.dim(`${context} → ${goal}`)}`);
      }
    });

  cmd
    .command('add')
    .description('Add task to inbox')
    .argument('<text>', 'task description')
    .action(async (text) => {
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
    });
}
