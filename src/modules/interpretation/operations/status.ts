import { NotFoundError } from '../../../system/error.js';
import type { Interpretation, InterpretationStatus } from '../domain/interpretation.js';
import type {
  DeclarationOutcome,
  DeclarationOutcomeSource,
  InterpretationStateStore,
  ReviewStore,
} from '../ports.js';

export interface EntryStatusResult {
  readonly entryId: string;
  readonly interpretationId: string;
  readonly status: InterpretationStatus;
  readonly attempts: number;
  readonly updatedAt: string;
  readonly availableAt?: string;
  readonly error?: string;
  readonly reviewIds: readonly string[];
  readonly declarations: readonly DeclarationOutcome[];
  readonly declarationStatus: 'none' | 'completed' | 'needsInput' | 'unsupported' | 'failed';
}

/**
 * Derives the user-facing state from operational processing and pending Reviews.
 */
export class GetEntryStatusQuery {
  constructor(
    private readonly interpretations: InterpretationStateStore,
    private readonly reviews: ReviewStore,
    private readonly declarationOutcomes?: DeclarationOutcomeSource,
  ) {}

  async execute(entryId: string): Promise<EntryStatusResult> {
    const interpretation = await this.getInterpretation(entryId);
    const reviews = await this.reviews.findPendingReviews(interpretation.id);
    const declarations = (await this.declarationOutcomes?.list(entryId)) ?? [];

    return Object.freeze({
      entryId,
      interpretationId: interpretation.id,
      status: interpretation.status,
      attempts: interpretation.attempts,
      updatedAt: interpretation.updatedAt,
      availableAt: interpretation.availableAt,
      error: interpretation.error,
      reviewIds: Object.freeze(reviews.map((review) => review.id)),
      declarations: Object.freeze([...declarations]),
      declarationStatus: summarizeDeclarations(declarations),
    });
  }

  private async getInterpretation(entryId: string): Promise<Interpretation> {
    const interpretation = await this.interpretations.findLatestInterpretation(entryId);
    if (!interpretation) throw new NotFoundError(`Entry ${entryId} has no Interpretation`);
    return interpretation;
  }
}

function summarizeDeclarations(
  declarations: readonly DeclarationOutcome[],
): EntryStatusResult['declarationStatus'] {
  if (declarations.length === 0) return 'none';
  for (const status of ['failed', 'needsInput', 'unsupported'] as const)
    if (declarations.some((declaration) => declaration.status === status)) return status;
  return 'completed';
}
