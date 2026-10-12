import type { Context, Entry } from './model.js';

export type TaskFacts = Pick<
  Entry,
  | 'id'
  | 'title'
  | 'area'
  | 'parentId'
  | 'plannedFor'
  | 'dueAt'
  | 'createdAt'
  | 'context'
  | 'effort'
  | 'importance'
> & { postponed: number; skippedToday: boolean };
export type Moment = { now: Date; today: string; context?: Context; minutes?: number };
export type RankedTask = TaskFacts & { score: number; reasons: string[] };

/** Upper bound in minutes for each effort level. */
const effortMinutes = [15, 60, 180, 480];

/**
 * Deterministic score for the "now" view. Weights are provisional; future-planned
 * tasks are hidden until their day.
 */
export function rankTasks(tasks: TaskFacts[], moment: Moment): RankedTask[] {
  const ranked: RankedTask[] = [];
  for (const task of tasks) {
    if (task.plannedFor && task.plannedFor > moment.today) continue;
    let score = 0;
    const reasons: string[] = [];
    const add = (points: number, reason: string) => {
      score += points;
      reasons.push(reason);
    };
    if (task.dueAt) {
      const hours = (task.dueAt.getTime() - moment.now.getTime()) / 3600000;
      if (hours < 0) add(100, 'overdue');
      else if (hours < 24) add(60, 'dueToday');
      else if (hours < 72) add(25, 'dueSoon');
    }
    if (task.plannedFor === moment.today) add(40, 'plannedToday');
    else if (task.plannedFor) add(45, 'plannedEarlier');
    if (task.importance != null) add(task.importance * 10, 'importance');
    if (moment.context && task.context) add(task.context === moment.context ? 15 : -40, 'context');
    if (moment.minutes != null && task.effort != null)
      add(effortMinutes[task.effort] > moment.minutes ? -40 : 5, 'effort');
    const days = (moment.now.getTime() - task.createdAt.getTime()) / 86400000;
    add(Math.min(20, Math.max(0, days) * 0.5), 'age');
    if (task.postponed) add(-8 * task.postponed, 'postponed');
    if (task.skippedToday) add(-50, 'skipped');
    ranked.push({ ...task, score: Math.round(score * 10) / 10, reasons });
  }
  return ranked.sort((a, b) => b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime());
}

export type Notice = {
  id: string;
  type: 'overdue' | 'dueSoon' | 'processingFailed';
  subjectId: string;
  title: string;
  message: string;
  at: Date;
};
type NoticeFacts = Pick<Entry, 'id' | 'title' | 'kind' | 'dueAt' | 'attempts' | 'error'> & {
  finishedAt: Date | null;
  createdAt: Date;
};

/** Passive notices derived from facts at read time; nothing is stored or pushed. */
export function deriveNotices(entries: NoticeFacts[], now: Date): Notice[] {
  const notices: Notice[] = [];
  const notice = (type: Notice['type'], entry: NoticeFacts, message: string, at: Date) =>
    notices.push({
      id: `${type}:${entry.id}`,
      type,
      subjectId: entry.id,
      title: entry.title,
      message,
      at,
    });
  for (const entry of entries) {
    if (entry.error && entry.attempts >= 3)
      notice('processingFailed', entry, `No se pudo clasificar: ${entry.title}`, entry.createdAt);
    if (entry.kind !== 'task' || entry.finishedAt || !entry.dueAt) continue;
    const hours = (entry.dueAt.getTime() - now.getTime()) / 3600000;
    if (hours < 0) notice('overdue', entry, `Tarea vencida: ${entry.title}`, entry.dueAt);
    else if (hours < 24) notice('dueSoon', entry, `Vence pronto: ${entry.title}`, entry.dueAt);
  }
  return notices.sort((a, b) => a.at.getTime() - b.at.getTime());
}
