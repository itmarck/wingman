import type { CreateStateCommand } from './operations/create.js';
import type { DerivedStateRegistry } from './operations/define.js';
import type { ListStateViewQuery } from './operations/list.js';
import type { StateEvaluator } from './services/evaluator.js';

export interface StateModule { readonly createState: CreateStateCommand; readonly listView: ListStateViewQuery; readonly evaluate: StateEvaluator; readonly derived: DerivedStateRegistry }
