#!/usr/bin/env node

/**
 * Notion task viewer — npm run dev -- notion
 *
 * Lists pending and in-progress tasks from the Notion Tasks database.
 * Grouped by context, sorted by urgency.
 */

import 'dotenv/config';
import chalk from 'chalk';
import { queryDatabase } from '../shared/notion.js';
import { loadDbIds } from '../agents/tasks/schema.js';

const URGENCY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };

const URGENCY_COLOR = {
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.blue,
  none: chalk.gray,
};

const CONTEXT_EMOJI = {
  work: '💼',
  personal: '🏠',
  family: '👨‍👩‍👧‍👦',
  digital: '💻',
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

  // Fetch pending + in_progress tasks
  const tasks = await queryDatabase(dbIds.tasks, {
    or: [
      { property: 'status', select: { equals: 'pending' } },
      { property: 'status', select: { equals: 'in_progress' } },
    ],
  });

  if (tasks.length === 0) {
    console.log(chalk.green('\n✓ No hay tareas pendientes. ¡Todo al día!\n'));
    return;
  }

  // Parse tasks
  const parsed = tasks.map((page) => ({
    title: extractTitle(page),
    status: page.properties.status?.select?.name || 'pending',
    urgency: page.properties.urgency?.select?.name || 'none',
    energy: page.properties.energy?.select?.name || '?',
    context: page.properties.context?.select?.name || '?',
    goal: page.properties.goal?.select?.name || 'none',
    due: page.properties.due?.date?.start || null,
  }));

  // Sort by urgency
  parsed.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9));

  // Group by context
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
      const urgColor = URGENCY_COLOR[t.urgency] || chalk.gray;
      const statusMark = t.status === 'in_progress' ? chalk.yellow('▶') : chalk.gray('○');
      const urgLabel = urgColor(`[${t.urgency}]`);
      const energyLabel = chalk.gray(`⚡${t.energy}`);
      const goalLabel = t.goal !== 'none' && GOAL_LABEL[t.goal] ? ` → ${GOAL_LABEL[t.goal]}` : '';
      const dueLabel = t.due ? chalk.red(` 📅 ${t.due}`) : '';

      console.log(`  ${statusMark} ${urgLabel} ${t.title} ${energyLabel}${goalLabel}${dueLabel}`);
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});
