import { randomUUID } from 'node:crypto';
import type { Classification, Classify } from '../platform/decisions.js';
import { areas, type Content, idSchema, Problem, validate } from './model.js';
import { type Database, transaction } from '../platform/storage.js';
import { refreshNotifications } from './work.js';

/** Claim one recoverable capture, call JEV outside SQL, and publish effects atomically. */
export async function run(
  db: Database,
  classify: Classify,
  signal?: AbortSignal,
): Promise<boolean> {
  const token = randomUUID();
  const claimed = await db.query<Content>(
    `UPDATE content SET "claimToken"=$1,"leaseUntil"=now()+interval '2 minutes',attempts=attempts+1
    WHERE id=(SELECT id FROM content WHERE "classifiedAt" IS NULL AND "archivedAt" IS NULL AND "nextAttemptAt"<=now()
      AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    [token],
  );
  const capture = claimed.rows[0];
  if (!capture) return false;
  const started = Date.now();
  let result: Classification;
  try {
    result = await classify({ text: capture.text, inputMode: capture.inputMode }, signal);
    if (
      !['task', 'keep', 'unsupported', 'undetermined'].includes(result.decision.destination) ||
      (result.decision.area !== 'undetermined' && !Object.hasOwn(areas, result.decision.area))
    )
      throw new Error('Invalid classification');
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Classification failed';
    await transaction(db, async (tx) => {
      const updated = await tx.query(
        `UPDATE content SET error=$3,"claimToken"=NULL,"leaseUntil"=NULL,
        "nextAttemptAt"=now()+make_interval(secs => LEAST(3600, power(2,LEAST(attempts,10))::integer))
        WHERE id=$1 AND "claimToken"=$2 RETURNING id`,
        [capture.id, token, message],
      );
      if (updated.rowCount)
        await tx.query('INSERT INTO telemetry ("contentId","durationMs",error) VALUES ($1,$2,$3)', [
          capture.id,
          Date.now() - started,
          message,
        ]);
      if (updated.rowCount && capture.attempts >= 3) {
        await tx.query(
          `INSERT INTO notifications ("subjectId",message) VALUES ($1,$2)
          ON CONFLICT ("subjectId") DO NOTHING`,
          [capture.id, `No se pudo procesar la captura; se reintentará: ${capture.title}`],
        );
      }
    });
    return true;
  }
  await transaction(db, async (tx) => {
    const current = (
      await tx.query(
        'SELECT * FROM content WHERE id=$1 AND "claimToken"=$2 AND "classifiedAt" IS NULL FOR UPDATE',
        [capture.id, token],
      )
    ).rows[0];
    if (!current) return;
    await tx.query('UPDATE notifications SET "resolvedAt"=now() WHERE "subjectId"=$1', [
      capture.id,
    ]);
    const settings = (await tx.query('SELECT "taskCapture" FROM settings WHERE id=true')).rows[0];
    let outcome = 'organized';
    const taskRequested = capture.inputMode === 'Entry' && capture.preset === 'taskCapture';
    if (
      !current.archivedAt &&
      taskRequested &&
      settings.taskCapture &&
      result.decision.destination === 'task' &&
      result.decision.area !== 'undetermined'
    ) {
      await tx.query(
        `INSERT INTO tasks (id,title,area,"plannedFor","dueAt","sourceId") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT ("sourceId") DO NOTHING`,
        [
          randomUUID(),
          capture.text,
          result.decision.area,
          capture.plannedFor,
          capture.dueAt,
          capture.id,
        ],
      );
      outcome = 'taskCreated';
    } else if (!current.archivedAt && taskRequested) {
      outcome = result.decision.destination === 'unsupported' ? 'unsupported' : 'retained';
      await tx.query(
        `INSERT INTO notifications ("subjectId",message) VALUES ($1,$2) ON CONFLICT ("subjectId")
          DO UPDATE SET message=excluded.message,"resolvedAt"=NULL,"acknowledgedAt"=NULL,"deferredUntil"=NULL`,
        [capture.id, `Captura conservada sin crear tarea: ${capture.title}`],
      );
    }
    await tx.query(
      `UPDATE content SET "classifiedAt"=now(),classification=$3,"claimToken"=NULL,"leaseUntil"=NULL,error=NULL WHERE id=$1 AND "claimToken"=$2`,
      [capture.id, token, JSON.stringify({ ...result.decision, outcome })],
    );
    await tx.query(
      'INSERT INTO telemetry ("contentId","durationMs",model,result) VALUES ($1,$2,$3,$4)',
      [capture.id, Date.now() - started, result.model, JSON.stringify(result.telemetry)],
    );
    await refreshNotifications(tx);
  });
  return true;
}

/** Retry an identified technical failure without resetting confirmed effects. */
export async function retry(db: Database, id: string): Promise<void> {
  validate(idSchema, id);
  const result = await db.query(
    `UPDATE content SET "nextAttemptAt"=now() WHERE id=$1 AND "classifiedAt" IS NULL AND error IS NOT NULL AND "claimToken" IS NULL RETURNING id`,
    [id],
  );
  if (!result.rowCount) throw new Problem(409, 'No retryable failure');
}

/** Run one Processor alongside HTTP, with bounded concurrency and interruptible shutdown. */
export function startProcessor(
  db: Database,
  classify: Classify,
  onError: (error: unknown) => void,
) {
  const abort = new AbortController();
  let wake: (() => void) | undefined;
  const done = (async () => {
    while (!abort.signal.aborted) {
      try {
        await transaction(db, refreshNotifications);
        if (await run(db, classify, abort.signal)) continue;
      } catch (error) {
        onError(error);
      }
      if (abort.signal.aborted) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  })();
  return async () => {
    abort.abort();
    wake?.();
    await done;
  };
}
