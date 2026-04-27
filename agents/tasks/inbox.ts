import { readFile } from 'fs/promises';
import { createLogger } from '../../shared/logger.js';
import { classifyRaw } from '../../shared/ai/index.js';
import { sendSlack } from '../../shared/slack.js';
import { queryDatabase, createPage, updatePage, props } from '../../shared/notion.js';
import { createEvent } from '../../shared/google/calendar.js';
import { ensureSchema } from './schema.js';

const log = createLogger('task');

const WEBHOOK_LOGS = process.env.SLACK_WEBHOOK_LOGS;

// ─── Config loading ─────────────────────────────────────────────

async function loadGoals() {
  return readFile('config/goals.md', 'utf-8');
}

// ─── Prompt building ────────────────────────────────────────────

function buildPrompt(goals, rawText) {
  return [
    goals,
    '',
    '---',
    '',
    `Texto: ${rawText}`,
  ].join('\n');
}

// ─── Helpers ────────────────────────────────────────────────────

function extractTitle(page) {
  for (const [, prop] of Object.entries(page.properties) as [string, any][]) {
    if (prop.type === 'title' && prop.title.length > 0) {
      return prop.title.map((t) => t.plain_text).join('');
    }
  }
  return '(sin título)';
}

// ─── Main agent ─────────────────────────────────────────────────

export async function runInboxAgent() {
  log.head('Inbox processing cycle');

  // 1. Ensure schema (creates DBs on first run, validates on subsequent)
  let dbIds;
  try {
    dbIds = await ensureSchema();
  } catch (err) {
    log.error(`Schema validation failed: ${err.message}`);
    return { summary: 'inbox: schema error' };
  }

  // 2. Fetch pending inbox items
  let pendingItems: any[];
  try {
    pendingItems = await (queryDatabase as any)(dbIds.inbox, {
      property: 'status',
      select: { equals: 'received' },
    });
  } catch (err) {
    log.error(`Failed to query inbox: ${err.message}`);
    return { summary: 'inbox: query error' };
  }

  if (pendingItems.length === 0) {
    log.info('No pending inbox items');
    return { summary: 'inbox: 0 pending' };
  }

  log.info(`Found ${pendingItems.length} pending inbox items`);

  // 3. Load goals config
  const goals = await loadGoals();

  // 4. Process each item
  const counts: Record<string, number> = { task: 0, project: 0, idea: 0, error: 0 };

  for (const item of pendingItems) {
    const rawText = extractTitle(item);
    const itemId = item.id;

    try {
      log.info(`Processing: "${rawText}"`, 1);

      // Classify — `medium` effort: more time on server is fine for richer output.
      const result = await classifyRaw(buildPrompt(goals, rawText), { effort: 'medium' });
      const type = (result.type as string) || 'task';
      counts[type] = (counts[type] || 0) + 1;

      log.data(`Classification for "${rawText}":`, result, 1);
      log.info(
        `"${rawText}" → ${type} [P:${result.priority ?? 0} E:${result.energy ?? 50}] ` +
          `(${result.context || '?'}${result.goal ? `, ${result.goal}` : ''})` +
          `${result.due_at ? ` due:${result.due_at}` : ''}` +
          `${result.calendar ? ' [cal]' : ''}` +
          `${result.confidence ? ` conf:${result.confidence}` : ''}`,
        1,
      );

      // Build task properties
      const taskProperties: Record<string, any> = {
        name: props.title(result.title || rawText),
        progress: props.number(0),
        priority: props.number(result.priority ?? 0),
        energy: props.number(result.energy ?? 50),
        context: props.select(result.context || 'personal'),
      };
      if (result.goal) taskProperties.goal = props.select(result.goal);
      if (result.due_at && typeof result.due_at === 'string') {
        taskProperties.due = props.date(result.due_at);
      }

      // Compose page body: next_action + description.
      const children: any[] = [];
      if (result.next_action) {
        children.push({
          object: 'block',
          type: 'callout',
          callout: {
            icon: { emoji: '➡️' },
            rich_text: [{ type: 'text', text: { content: `Próximo paso: ${result.next_action}` } }],
          },
        });
      }
      if (result.description) {
        children.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: result.description } }],
          },
        });
      }

      // Create task in Notion
      const taskPage = await createPage(dbIds.tasks, taskProperties, children);
      log.ok(`Created task: "${result.title || rawText}" → ${taskPage.id.slice(0, 8)}...`, 1);

      // Create subtasks if any
      const subtasks = (result.subtasks as any[]) || [];
      if (subtasks.length > 0) {
        for (let i = 0; i < subtasks.length; i++) {
          const subtaskText = subtasks[i];
          if (!subtaskText) continue;

          const subtaskProps = {
            name: props.title(subtaskText),
            progress: props.number(0),
            task: props.relation([taskPage.id]),
            order: props.number(i + 1),
          };
          await createPage(dbIds.subtasks, subtaskProps);
        }
        log.ok(`Created ${subtasks.length} subtasks`, 2);
      }

      // Create Google Calendar event for time-bound items.
      if (result.calendar === true && typeof result.due_at === 'string') {
        try {
          await createEvent({
            title: (result.title as string) || rawText,
            description: [
              result.next_action ? `Próximo paso: ${result.next_action}` : '',
              result.description || '',
            ].filter(Boolean).join('\n\n'),
            startIso: result.due_at,
            durationMinutes: typeof result.duration_minutes === 'number' ? result.duration_minutes : 30,
          });
        } catch (err) {
          log.error(`Calendar event creation failed for "${result.title || rawText}": ${err.message}`);
        }
      }

      // Mark inbox item as processed
      await updatePage(itemId, { status: props.select('processed') });
    } catch (err) {
      counts.error++;
      log.error(`Failed to process "${rawText}": ${err.message}`);
      log.verb(`Stack: ${err.stack}`, 1);

      // Mark as failed so it doesn't get re-processed infinitely
      try {
        await updatePage(itemId, { status: props.select('failed') });
      } catch (updateErr) {
        log.error(`Failed to mark item as failed: ${updateErr.message}`);
      }
    }
  }

  // 5. Summary
  const parts: string[] = [];
  if (counts.task > 0) parts.push(`${counts.task} tasks`);
  if (counts.project > 0) parts.push(`${counts.project} projects`);
  if (counts.idea > 0) parts.push(`${counts.idea} ideas`);
  if (counts.error > 0) parts.push(`${counts.error} errors`);

  const summaryText = `inbox: ${pendingItems.length} processed (${parts.join(', ')})`;
  log.ok(`Cycle done: ${summaryText}`);

  // Notify to agent logs channel
  if (WEBHOOK_LOGS && pendingItems.length > 0) {
    try {
      await sendSlack(WEBHOOK_LOGS, `[task-agent] ${summaryText}`);
    } catch {
      // Don't fail the cycle over a log notification
    }
  }

  return { summary: summaryText };
}

// ─── Direct execution ───────────────────────────────────────────

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  runInboxAgent()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error(`Fatal error: ${err.message}`);
      process.exit(1);
    });
}
