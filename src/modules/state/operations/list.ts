import type { Evaluation } from '../../../core/state/condition.js';
import type { Modality, State } from '../../../core/state/state.js';
import type { Clock } from '../../../system/runtime.js';
import type { InterpretationStore } from '../../interpretation/ports/store.js';
import type { DerivedStateDefinition } from '../domain/definition.js';
import type { StateStore } from '../ports/store.js';
import type { StateEvaluator } from '../services/evaluator.js';
import type { DerivedStateRegistry } from './define.js';

export const stateViews = ['current', 'desired', 'required', 'forbidden', 'predicted', 'unresolved'] as const;
export type StateView = (typeof stateViews)[number];
export interface StateViewItem { readonly id: string; readonly modality: Modality; readonly source: 'persisted' | 'derived'; readonly evaluation: Evaluation; readonly description?: string; readonly state?: State }

export class ListStateViewQuery {
  constructor(private readonly states: StateStore, private readonly definitions: DerivedStateRegistry, private readonly knowledge: InterpretationStore, private readonly evaluator: StateEvaluator, private readonly clock: Clock) {}
  async execute(view: StateView): Promise<readonly StateViewItem[]> {
    const snapshot = await this.knowledge.loadKnowledge();
    const persisted = (await this.states.listStates()).filter((state) => isApplicable(state, this.clock.now())).map((state) => result(state, this.evaluator.evaluate(state.condition, snapshot)));
    const derived = this.definitions.list().map((definition) => derivedResult(definition, this.evaluator.evaluate(definition.condition, snapshot)));
    const results = [...persisted, ...derived];
    if (view === 'unresolved') return Object.freeze(results.filter((item) => item.evaluation === 'unresolved'));
    const modalities = view === 'current' ? new Set<Modality>(['observed', 'believed']) : new Set<Modality>([view]);
    return Object.freeze(results.filter((item) => modalities.has(item.modality)));
  }
}

function result(state: State, evaluation: Evaluation): StateViewItem { return Object.freeze({ id: state.id, modality: state.modality, source: 'persisted' as const, evaluation, state }); }
function derivedResult(definition: DerivedStateDefinition, evaluation: Evaluation): StateViewItem { return Object.freeze({ id: definition.id, modality: definition.modality, source: 'derived' as const, evaluation, description: definition.description }); }
function isApplicable(state: State, now: Date): boolean { const timestamp = now.getTime(); return (!state.validTime?.from || Date.parse(state.validTime.from) <= timestamp) && (!state.validTime?.to || timestamp < Date.parse(state.validTime.to)); }
