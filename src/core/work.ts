import { randomUUID } from 'node:crypto';
import { type Static, Type } from 'typebox';
import type { Notification, Task } from './model.js';
import {
  areaSchema,
  dateSchema,
  idSchema,
  Problem,
  type Settings,
  settingsSchema,
  temporal,
  temporalSchema,
  textSchema,
  validate,
} from './model.js';
import { type Database, type Transaction, transaction } from '../platform/storage.js';

export const taskSchema = Type.Object(
  {
    id: Type.Optional(idSchema),
    title: textSchema,
    area: areaSchema,
    plannedFor: Type.Union([dateSchema, Type.Null()]),
    dueAt: Type.Optional(temporalSchema),
  },
  { additionalProperties: false },
);

/** Internal deterministic Task creation/editing; completion has its own operation. */
export async function saveTask(db: Database, input: Static<typeof taskSchema>): Promise<Task> {
  validate(taskSchema, input);
  input = structuredClone(input);
  temporal(input.plannedFor);
  temporal(input.dueAt);
  return transaction(db, async (tx) => {
    if (
      input.id &&
      !(await tx.query('SELECT id FROM tasks WHERE id=$1 FOR UPDATE', [input.id])).rows[0]
    )
      throw new Problem(404, 'Task not found');
    return (
      await tx.query(
        `INSERT INTO tasks (id,title,area,"plannedFor","dueAt") VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET title=excluded.title,area=excluded.area,"plannedFor"=excluded."plannedFor","dueAt"=excluded."dueAt","updatedAt"=clock_timestamp() RETURNING *`,
        [input.id ?? randomUUID(), input.title, input.area, input.plannedFor, input.dueAt ?? null],
      )
    ).rows[0];
  });
}

/** Dates are planning facts; due instants are interpreted in the selected zone. */
export async function day(
  db: Database,
  from: string,
  to = from,
  timezone = 'America/Lima',
): Promise<Task[]> {
  validate(dateSchema, from);
  validate(dateSchema, to);
  temporal(from);
  temporal(to);
  validTimezone(timezone);
  if (to < from || Date.parse(to) - Date.parse(from) > 366 * 86400000)
    throw new Problem(400, 'Invalid date range');
  return (
    await db.query(
      `SELECT * FROM tasks WHERE "archivedAt" IS NULL AND (
    "plannedFor" BETWEEN $1::date AND $2::date OR ("plannedFor" IS NULL AND
    CASE WHEN length("dueAt")=10 THEN "dueAt"::date ELSE ("dueAt"::timestamptz AT TIME ZONE $3)::date END BETWEEN $1::date AND $2::date))
    ORDER BY "plannedFor" NULLS LAST,"createdAt",id LIMIT 500`,
      [from, to, timezone],
    )
  ).rows;
}

/** Completing or reopening a selected Task refreshes its passive notice atomically. */
export async function complete(db: Database, id: string, finished: boolean): Promise<Task> {
  validate(idSchema, id);
  validate(Type.Boolean(), finished);
  return transaction(db, async (tx) => {
    const result = await tx.query(
      `UPDATE tasks SET "finishedAt"=CASE WHEN $2 THEN coalesce("finishedAt",now()) ELSE NULL END,
      "updatedAt"=clock_timestamp() WHERE id=$1 RETURNING *`,
      [id, finished],
    );
    if (!result.rows[0]) throw new Problem(404, 'Task not found');
    await refreshNotifications(tx);
    return result.rows[0];
  });
}

/** Maintain one notice per subject; resolving facts retire notices without acknowledgment. */
export async function refreshNotifications(tx: Transaction): Promise<void> {
  await tx.query(`UPDATE notifications n SET "resolvedAt"=now() FROM tasks t WHERE n."subjectId"=t.id AND n."resolvedAt" IS NULL AND
    (t."finishedAt" IS NOT NULL OR t."archivedAt" IS NOT NULL OR t."dueAt" IS NULL OR
    CASE WHEN length(t."dueAt")=10 THEN t."dueAt"::date >= (now() AT TIME ZONE (SELECT timezone FROM settings))::date ELSE t."dueAt"::timestamptz > now() END)`);
  await tx.query(`INSERT INTO notifications ("subjectId",message)
    SELECT id,'Tarea vencida: '||title FROM tasks WHERE "finishedAt" IS NULL AND "archivedAt" IS NULL AND
    CASE WHEN length("dueAt")=10 THEN "dueAt"::date < (now() AT TIME ZONE (SELECT timezone FROM settings))::date ELSE "dueAt"::timestamptz <= now() END
    ON CONFLICT ("subjectId") DO UPDATE SET message=excluded.message,
    "acknowledgedAt"=CASE WHEN notifications."resolvedAt" IS NOT NULL THEN NULL ELSE notifications."acknowledgedAt" END,
    "deferredUntil"=CASE WHEN notifications."resolvedAt" IS NOT NULL THEN NULL ELSE notifications."deferredUntil" END,"resolvedAt"=NULL`);
}

/** Pure read: visibility derives from acknowledgment, deferral and resolution facts. */
export async function notifications(db: Database): Promise<Notification[]> {
  return (
    await db.query(`SELECT * FROM notifications WHERE "acknowledgedAt" IS NULL AND "resolvedAt" IS NULL
    AND ("deferredUntil" IS NULL OR "deferredUntil"<=now()) ORDER BY "createdAt","subjectId" LIMIT 100`)
  ).rows;
}

/** Responding to a notice never completes the subject Task. */
export async function respond(
  db: Database,
  id: string,
  action: 'acknowledge' | 'defer',
  until?: string,
) {
  validate(idSchema, id);
  if (!['acknowledge', 'defer'].includes(action))
    throw new Problem(400, 'Invalid notification response');
  if (action === 'defer') {
    if (!until || !/T.*(Z|[+-]\d{2}:\d{2})$/.test(until) || Date.parse(until) <= Date.now())
      throw new Problem(400, 'Deferral needs a future timestamp');
    temporal(until);
  }
  const result = await db.query(
    `UPDATE notifications SET "acknowledgedAt"=CASE WHEN $2='acknowledge' THEN now() ELSE NULL END,
    "deferredUntil"=CASE WHEN $2='defer' THEN $3::timestamptz ELSE NULL END WHERE "subjectId"=$1 AND "resolvedAt" IS NULL RETURNING *`,
    [id, action, until ?? null],
  );
  if (!result.rows[0]) throw new Problem(404, 'Active notification not found');
  return result.rows[0];
}

/** The timezone is an IANA zone accepted by the runtime. */
export function validTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new Problem(400, 'Invalid timezone');
  }
}
export async function readSettings(db: Database): Promise<Settings> {
  return (await db.query('SELECT timezone,"taskCapture" FROM settings WHERE id=true')).rows[0];
}
/** Preferences do not contain credentials or user-defined capabilities. */
export async function saveSettings(db: Database, input: Settings) {
  validate(settingsSchema, input);
  validTimezone(input.timezone);
  return (
    await db.query(
      'UPDATE settings SET timezone=$1,"taskCapture"=$2 WHERE id=true RETURNING timezone,"taskCapture"',
      [input.timezone, input.taskCapture],
    )
  ).rows[0];
}
