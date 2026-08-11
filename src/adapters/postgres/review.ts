import { Review } from '../../modules/interpretation/domain/review.js';
import type { ReviewResolution, ReviewStore } from '../../modules/interpretation/ports.js';
import { ConflictError } from '../../system/error.js';
import type { Page, PageRequest } from '../../system/page.js';
import { inTransaction, type QueryableDatabase } from './database.js';
import { decodeCursor, encodeCursor } from './page.js';
import { dateTime, freezeList, json, jsonValue, optionalDateTime, optionalJson } from './rows.js';

type Row = Record<string, unknown>;

/** PostgreSQL Review persistence and completion locking. */
export class PostgresReviewStore implements ReviewStore {
  constructor(private readonly database: QueryableDatabase) {}

  async saveReview(review: Review): Promise<void> {
    await inTransaction(this.database, (database) => saveReview(database, review));
  }
  async saveReviews(reviews: readonly Review[]): Promise<void> {
    if (new Set(reviews.map(({ id }) => id)).size !== reviews.length)
      throw new ConflictError('Reviews cannot contain duplicate identities');
    await inTransaction(this.database, async (database) => {
      for (const review of reviews) await saveReview(database, review);
    });
  }
  async findReview(id: string): Promise<Review | undefined> {
    const row = (
      await this.database.query<Row>('SELECT * FROM interpretation_reviews WHERE id=$1', [id])
    ).rows[0];
    return row ? decodeReview(row) : undefined;
  }
  async findInterpretationReviews(interpretationId: string): Promise<readonly Review[]> {
    const result = await this.database.query<Row>(
      'SELECT * FROM interpretation_reviews WHERE interpretation_id=$1 ORDER BY created_at,id',
      [interpretationId],
    );
    return freezeList(result.rows.map(decodeReview));
  }
  async findPendingReviews(interpretationId: string): Promise<readonly Review[]> {
    return freezeList(
      (await this.findInterpretationReviews(interpretationId)).filter(
        ({ status }) => status === 'pending',
      ),
    );
  }
  async findPendingEntryReviews(entryId: string): Promise<readonly Review[]> {
    const result = await this.database.query<Row>(
      `SELECT * FROM interpretation_reviews WHERE entry_id=$1 AND status='pending' ORDER BY created_at,id`,
      [entryId],
    );
    return freezeList(result.rows.map(decodeReview));
  }
  async listPendingReviews(request: PageRequest): Promise<Page<Review>> {
    const cursor = decodeCursor(request.cursor, request.scope);
    const result = await this.database.query<Row>(
      `SELECT * FROM interpretation_reviews WHERE status='pending'
       AND ($1::timestamptz IS NULL OR (created_at,id)<($1::timestamptz,$2::text))
       ORDER BY created_at DESC,id DESC LIMIT $3`,
      [cursor?.timestamp ?? null, cursor?.id ?? null, request.limit + 1],
    );
    const values = result.rows.map(decodeReview);
    const hasNext = values.length > request.limit;
    const items = values.slice(0, request.limit);
    const last = hasNext ? items.at(-1) : undefined;
    return Object.freeze({
      items: freezeList(items),
      nextCursor: encodeCursor(
        last ? { id: last.id, timestamp: last.createdAt } : undefined,
        request.scope,
      ),
    });
  }
  async stageResolution(review: Review): Promise<ReviewResolution> {
    return inTransaction(this.database, async (database) => {
      const current = (
        await database.query<Row>('SELECT * FROM interpretation_reviews WHERE id=$1 FOR UPDATE', [
          review.id,
        ])
      ).rows[0];
      if (!current || decodeReview(current).status !== 'pending')
        throw new ConflictError(`Review ${review.id} is already resolved`);
      const related = (
        await database.query<Row>(
          'SELECT * FROM interpretation_reviews WHERE interpretation_id=$1 ORDER BY created_at,id FOR UPDATE',
          [review.interpretationId],
        )
      ).rows.map(decodeReview);
      const reviews = related.map((candidate) => (candidate.id === review.id ? review : candidate));
      if (reviews.some((candidate) => candidate.status === 'pending')) {
        await saveReview(database, review);
        return Object.freeze({ reviews: freezeList(reviews), requiresCompletion: false });
      }
      const lock = await database.query<{ interpretation_id: string }>(
        `INSERT INTO interpretation_review_locks (interpretation_id,acquired_at)
         VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING interpretation_id`,
        [review.interpretationId, review.resolvedAt],
      );
      if (lock.rows.length !== 1)
        throw new ConflictError(
          `Interpretation ${review.interpretationId} Review completion is already running`,
        );
      return Object.freeze({ reviews: freezeList(reviews), requiresCompletion: true });
    });
  }
  async finishCompletion(interpretationId: string): Promise<void> {
    await this.database.query(
      'DELETE FROM interpretation_review_locks WHERE interpretation_id=$1',
      [interpretationId],
    );
  }
  async releaseCompletion(interpretationId: string): Promise<void> {
    await this.finishCompletion(interpretationId);
  }
}

export async function saveReview(database: QueryableDatabase, review: Review): Promise<void> {
  const current = (
    await database.query<Row>('SELECT * FROM interpretation_reviews WHERE id=$1 FOR UPDATE', [
      review.id,
    ])
  ).rows[0];
  if (!current) {
    await database.query(
      `INSERT INTO interpretation_reviews
      (id,interpretation_id,entry_id,kind,status,resolution,decision,created_at,resolved_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        review.id,
        review.interpretationId,
        review.entryId,
        review.kind,
        review.status,
        jsonValue(review.resolution),
        review.decision ? jsonValue(review.decision) : null,
        review.createdAt,
        review.resolvedAt ?? null,
      ],
    );
    return;
  }
  const existing = decodeReview(current);
  if (existing.status === 'resolved' || existing.interpretationId !== review.interpretationId)
    throw new ConflictError(`Review ${review.id} is already resolved`);
  const result = await database.query<{ id: string }>(
    `UPDATE interpretation_reviews
    SET status=$1,decision=$2,resolved_at=$3 WHERE id=$4 AND status='pending' RETURNING id`,
    [
      review.status,
      review.decision ? jsonValue(review.decision) : null,
      review.resolvedAt ?? null,
      review.id,
    ],
  );
  if (result.rows.length !== 1) throw new ConflictError(`Review ${review.id} changed concurrently`);
}

function decodeReview(row: Row): Review {
  return Review.rehydrate({
    id: String(row.id),
    kind: row.kind as 'referenceResolution',
    status: row.status as Review['status'],
    interpretationId: String(row.interpretation_id),
    entryId: String(row.entry_id),
    resolution: json<Review['resolution']>(row.resolution, 'Review resolution'),
    decision: optionalJson(row.decision),
    createdAt: dateTime(row.created_at, 'Review createdAt'),
    resolvedAt: optionalDateTime(row.resolved_at, 'Review resolvedAt'),
  });
}
