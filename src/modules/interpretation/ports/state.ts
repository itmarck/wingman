import type { Interpretation, InterpretationId } from '../domain/interpretation.js';

export interface InterpretationStateStore {
  saveInterpretation(interpretation: Interpretation): Promise<void>;
  findInterpretation(id: InterpretationId): Promise<Interpretation | undefined>;
  findLatestInterpretation(entryId: string): Promise<Interpretation | undefined>;
  listInterpretations(entryId: string): Promise<readonly Interpretation[]>;
}
