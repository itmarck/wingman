#!/usr/bin/env node

/**
 * Notion task viewer — npm run dev -- notion
 *
 * Lists pending and in-progress tasks from the Notion Tasks database.
 * Grouped by context, sorted by priority (highest first).
 */

import { loadConfig } from '../lib/env.js';
import chalk from 'chalk';

loadConfig();
import { queryDatabase } from '../lib/notion.js';
import { loadDbIds } from '../agents/tasks/schema.js';

function priorityColor(p) {
  if (p >= 76) return chalk.red;
  if (p >= 51) return chalk.yellow;
  if (p >= 26) return chalk.blue;
  return chalk.gray;
}

const CONTEXT_EMOJI = {
  work: '💼',
  personal: '🏠',
  family: '👨‍👩‍👧‍👦',
  brand: '🏷️',
};

const GOAL_LABEL = {
  career: chalk.blue('career'),
  english: chalk.magenta('english'),
  minima: chalk.hex('#FF8800')('minima'),
  automation: chalk.green('automation'),
};

function extractTitle(page) {
  for (const [, prop] of Object.entries(page.properties)) {
    if (prop.type === 'title' && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join('');
    }
  }
  return '(sin título)';
}

function statusMark(progress) {
  if (progress === 0) return chalk.gray('○');
  if (progress >= 100) return chalk.green('✓');
  return chalk.yellow('▶');
}

async function main() {
  const dbIds = await loadDbIds();

  if (!dbIds.tasks) {
    console.log(
      chalk.yellow('\nNo se encontró la base de datos de tareas. Ejecuta primero el agente inbox para crear el schema.\n'),
    );
    console.log(chalk.gray('  npm run dev -- migrate'));
    console.log('');
    process.exit(1);
  }

  const tasks = await queryDatabase(dbIds.tasks, {
    property: 'progress',
    number: { less_than: 100 },
  });

  if (tasks.length === 0) {
    console.log(chalk.green('\n✓ No hay tareas pendientes. ¡Todo al día!\n'));
    return;
  }

  const parsed = tasks.map((page) => ({
    title: extractTitle(page),
    progress: page.properties.progress?.number ?? 0,
    priority: page.properties.priority?.number ?? 0,
    energy: page.properties.energy?.number ?? 50,
    context: page.properties.context?.select?.name || '?',
    goal: page.properties.goal?.select?.name || null,
    due: page.properties.due?.date?.start || null,
  }));

  parsed.sort((a, b) => b.priority - a.priority);

  const grouped = new Map();
  for (const t of parsed) {
    const ctx = t.context;
    if (!grouped.has(ctx)) grouped.set(ctx, []);
    grouped.get(ctx).push(t);
  }

  console.log(chalk.white.bold(`\n📋 Tareas pendientes (${tasks.length})\n`));

  for (const [context, items] of grouped) {
    const emoji = CONTEXT_EMOJI[context] || '📌';
    console.log(`${emoji} ${chalk.white.bold(context.toUpperCase())}`);

    for (const t of items) {
      const pColor = priorityColor(t.priority);
      const mark = statusMark(t.progress);
      const pLabel = pColor(`[P:${t.priority}]`);
      const eLabel = chalk.gray(`⚡${t.energy}`);
      const goalLabel = t.goal && GOAL_LABEL[t.goal] ? ` → ${GOAL_LABEL[t.goal]}` : '';
      const dueLabel = t.due ? chalk.red(` 📅 ${t.due}`) : '';
      const progressLabel = t.progress > 0 ? chalk.cyan(` ${t.progress}%`) : '';

      console.log(`  ${mark} ${pLabel} ${t.title} ${eLabel}${progressLabel}${goalLabel}${dueLabel}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});
