import { createInferenceAdapter } from '../../src/adapters/inference/adapter.js';
import { readInferenceConfig } from '../../src/adapters/inference/config.js';
import type { ComponentRevision } from '../../src/core/item/component.js';
import type { EntryStatusResult } from '../../src/modules/interpretation/operations/status.js';
import type {
  InferenceRun,
  InferenceTelemetry,
} from '../../src/modules/interpretation/ports/telemetry.js';
import type { InterpretationAdapter } from '../../src/modules/interpretation/services/interpreter.js';
import { InterpreterUnavailableError } from '../../src/modules/interpretation/services/interpreter.js';
import type { GlossaryResult } from '../../src/modules/projection/domain/glossary.js';
import type { CurrentItemsResult } from '../../src/modules/projection/domain/items.js';
import type { ReminderExplanation } from '../../src/modules/reminder/operations/manage.js';
import { createSystem, type System } from '../../src/system/system.js';

const defaultEvaluationTimeoutMs = 30_000;
const pollingIntervalMs = 100;
const registeredCases: RegisteredCase[] = [];

export interface EvaluationCase {
  readonly description: string;
  readonly entry: string;
  readonly expectations: readonly Expectation[];
}

export interface EvaluationResult {
  readonly entryId: string;
  readonly status: EntryStatusResult;
  readonly components: readonly ComponentRevision[];
  readonly items: GlossaryResult['items'];
  readonly reviews: readonly ReviewResult[];
  readonly runs: readonly InferenceRun[];
  readonly profiles: readonly string[];
  readonly reminders: readonly ReminderExplanation[];
  readonly ruleCount: number;
  readonly intentCount: number;
  readonly attemptCount: number;
  readonly adapterOutputs: readonly unknown[];
}

export interface EvaluationReport {
  readonly target: string;
  readonly model: string;
  readonly repeat: number;
  readonly cases: readonly CaseReport[];
  readonly passed: number;
  readonly failed: number;
  readonly unstable: number;
  readonly blocked?: string;
}

export interface CaseReport {
  readonly description: string;
  readonly iterations: readonly IterationReport[];
  readonly passed: number;
  readonly failed: number;
  readonly stable: boolean;
}

export interface IterationReport {
  readonly iteration: number;
  readonly result?: EvaluationResult;
  readonly checks: readonly CheckReport[];
  readonly error?: string;
}

export interface CheckReport {
  readonly name: string;
  readonly passed: boolean;
  readonly message?: string;
}

export interface ReviewResult {
  readonly reference: string;
  readonly question: string;
}

export interface Expectation {
  readonly name: string;
  check(result: EvaluationResult): string | undefined;
}

export interface CaseInput {
  readonly entry: string;
  readonly expect: readonly Expectation[];
}

export type CaseFactory = () => CaseInput;

interface RegisteredCase {
  readonly description: string;
  readonly factory: CaseFactory;
}

/** Registers one isolated semantic evaluation case for the next run. */
export function define(description: string, factory: CaseFactory): void {
  if (!description.trim()) {
    throw new Error('Evaluation case description is required');
  }

  if (registeredCases.some((test) => test.description === description.trim())) {
    throw new Error(`Evaluation case "${description}" is duplicated`);
  }

  registeredCases.push(
    Object.freeze({
      description: description.trim(),
      factory,
    }),
  );
}

function create(test: RegisteredCase): EvaluationCase {
  const input = test.factory();

  if (!input.entry.trim()) {
    throw new Error(`Evaluation case "${test.description}" requires an Entry`);
  }

  if (input.expect.length === 0) {
    throw new Error(`Evaluation case "${test.description}" requires at least one expectation`);
  }

  return Object.freeze({
    description: test.description,
    entry: input.entry,
    expectations: Object.freeze([...input.expect]),
  });
}

/** Expects the final user-facing Interpretation status. */
export function status(expected: EntryStatusResult['status']): Expectation {
  return expectation(`status is ${expected}`, (result) =>
    result.status.status === expected
      ? undefined
      : `Expected ${expected}, received ${result.status.status}`,
  );
}

/** Expects the exact number of currently published Axioms. */
export function axioms(expected: number): Expectation {
  return count('Components', expected, (result) => result.components.length);
}

/** Expects the exact number of pending Reviews. */
export function reviews(expected: number): Expectation {
  return count('Reviews', expected, (result) => result.reviews.length);
}

/** Expects an exact verbatim quote Literal among the published Axioms. */
export function quote(expected: string): Expectation {
  return expectation(`quote equals «${expected}»`, (result) => {
    const found = result.components.some(
      (component) => component.key === 'quote' && component.value === expected,
    );

    const observed = result.components
      .filter((component) => component.key === 'quote')
      .map((component) => JSON.stringify(component.value));
    return found
      ? undefined
      : `No exact quote Literal matched «${expected}»; observed=${observed.join(',') || 'none'}`;
  });
}

/** Expects the exact set of planning Profiles derived from this Entry. */
export function profiles(...expected: readonly string[]): Expectation {
  return expectation(`profiles equal ${expected.join(',') || 'none'}`, (result) =>
    sameValues(result.profiles, expected)
      ? undefined
      : `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(result.profiles)}`,
  );
}

/** Expects the exact workflow outcome sequence exposed by Entry status. */
export function workflows(...expected: readonly string[]): Expectation {
  return expectation(`workflows equal ${expected.join(',') || 'none'}`, (result) => {
    const actual = result.status.workflows.map((workflow) => workflow.status);
    return sameValues(actual, expected)
      ? undefined
      : `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
  });
}

/** Expects the exact number of active reminder workflows. */
export function reminders(expected: number): Expectation {
  return count('Reminders', expected, (result) => result.reminders.length);
}

/** Requires interpretation to create no executable or proactive effect. */
export function noExecutableEffects(): Expectation {
  return expectation('creates no executable effects', (result) =>
    result.intentCount === 0 && result.attemptCount === 0
      ? undefined
      : `Created intents=${result.intentCount} attempts=${result.attemptCount}`,
  );
}

export interface RunOptions {
  readonly repeat?: number;
  readonly filter?: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

/** Runs every case with real inference and an isolated in-memory system per repetition. */
export async function run(options: RunOptions = {}): Promise<EvaluationReport> {
  const cases = collect(options.filter);
  const config = readInferenceConfig();
  const repeat = readRepeat(options.repeat);
  const timeoutMs = positiveInteger(options.timeoutMs ?? defaultEvaluationTimeoutMs, 'timeoutMs');
  const maxAttempts = positiveInteger(options.maxAttempts ?? 2, 'maxAttempts');
  const reports: CaseReport[] = [];
  let blocked: string | undefined;

  for (const evaluationCase of cases) {
    const iterations: IterationReport[] = [];

    for (let iteration = 1; iteration <= repeat; iteration += 1) {
      iterations.push(await execute(evaluationCase, config, iteration, timeoutMs, maxAttempts));
    }

    const failed = iterations.filter((result) => !passed(result)).length;

    reports.push(
      Object.freeze({
        description: evaluationCase.description,
        iterations: Object.freeze(iterations),
        passed: iterations.length - failed,
        failed,
        stable: isStable(iterations),
      }),
    );
    if (providerUnavailable(iterations)) {
      blocked = `Provider unavailable while running "${evaluationCase.description}"; remaining cases were not called`;
      break;
    }
  }

  const failed = reports.filter((report) => report.failed > 0).length;
  const unstable = reports.filter((report) => !report.stable).length;

  return Object.freeze({
    target: config.target,
    model: config.model,
    repeat,
    cases: Object.freeze(reports),
    passed: reports.length - failed,
    failed,
    unstable,
    blocked,
  });
}

/** Prints one stable human-readable console report. */
export function print(report: EvaluationReport): void {
  console.log(paint('cyan', 'Wingman semantic evaluation'));
  console.log(`Target: ${report.target}`);
  console.log(`Model: ${report.model}`);
  console.log(`Repeat: ${report.repeat}`);
  console.log('');

  for (const evaluationCase of report.cases) {
    const casePassed = evaluationCase.failed === 0;

    console.log(`${mark(casePassed)}  ${evaluationCase.description}`);

    for (const result of evaluationCase.iterations) {
      if (report.repeat > 1) {
        console.log(`      ${mark(passed(result))}  run ${result.iteration}`);
      }

      const indentation = report.repeat > 1 ? '            ' : '      ';

      if (result.error) {
        console.log(`${indentation}${paint('red', result.error)}`);
        continue;
      }

      for (const check of result.checks) {
        console.log(`${indentation}${mark(check.passed)}  ${check.name}`);

        if (check.message) {
          console.log(`${indentation}      ${paint('red', check.message)}`);
        }
      }

      if (result.result) {
        const inputTokens = sum(result.result.runs, 'inputTokens');
        const outputTokens = sum(result.result.runs, 'outputTokens');
        const durationMs = result.result.runs.reduce((total, run) => total + run.durationMs, 0);

        console.log(
          paint(
            'dim',
            `${indentation}attempts=${result.result.status.attempts} input=${inputTokens} output=${outputTokens} duration=${durationMs}ms`,
          ),
        );

        if (result.result.status.error) {
          console.log(`${indentation}${paint('red', `error=${result.result.status.error}`)}`);
        }
      }
    }

    if (report.repeat > 1) {
      console.log(
        `${paint(evaluationCase.failed === 0 ? 'green' : 'yellow', `${evaluationCase.passed}/${report.repeat}`)} repetitions passed`,
      );
    }
  }

  console.log('');
  console.log(
    paint(
      report.failed === 0 ? 'green' : 'red',
      `${report.passed}/${report.cases.length} cases passed`,
    ),
  );
  if (report.repeat > 1)
    console.log(`Stable cases: ${report.cases.length - report.unstable}/${report.cases.length}`);
}

async function execute(
  evaluationCase: EvaluationCase,
  config: ReturnType<typeof readInferenceConfig>,
  iteration: number,
  timeoutMs: number,
  maxAttempts: number,
): Promise<IterationReport> {
  const telemetry = new EvaluationTelemetry();
  const adapter = new RecordingAdapter(createInferenceAdapter(config));
  const system = createSystem('memory', {
    adapter,
    inference: config,
    mode: 'write',
    telemetry,
    processing: {
      leaseDurationMs: 60_000,
      leaseRenewalIntervalMs: 10_000,
      pollingIntervalMs,
      retryDelaysMs: Object.freeze(Array.from({ length: maxAttempts - 1 }, () => 0)),
    },
  });

  try {
    const result = await interpret(system, telemetry, adapter, evaluationCase, timeoutMs);
    const checks = evaluationCase.expectations.map((item) => {
      const message = item.check(result);

      return Object.freeze({
        name: item.name,
        passed: message === undefined,
        message,
      });
    });

    return Object.freeze({
      iteration,
      result,
      checks: Object.freeze(checks),
    });
  } catch (error) {
    return Object.freeze({
      iteration,
      checks: Object.freeze([]),
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await system.close();
  }
}

async function interpret(
  system: System,
  telemetry: EvaluationTelemetry,
  adapter: RecordingAdapter,
  evaluationCase: EvaluationCase,
  timeoutMs: number,
): Promise<EvaluationResult> {
  const entryId = await system.capture.captureEntry.execute({
    content: {
      kind: 'text',
      text: evaluationCase.entry,
    },
    origin: {
      source: 'evaluate',
      externalId: evaluationCase.description,
    },
  });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let processingError: unknown;

    try {
      await system.interpretation.processNext.execute();
    } catch (error) {
      processingError = error;
    }

    const current = await system.interpretation.getEntryStatus.execute(entryId);

    if (isTerminal(current.status)) {
      return observe(system, telemetry, adapter.outputs, entryId, current);
    }

    if (processingError && !(processingError instanceof InterpreterUnavailableError)) {
      throw processingError;
    }

    await wait(waitDuration(current.availableAt));
  }

  throw new Error(`Evaluation case "${evaluationCase.description}" timed out`);
}

async function observe(
  system: System,
  telemetry: EvaluationTelemetry,
  adapterOutputs: readonly unknown[],
  entryId: string,
  current: EntryStatusResult,
): Promise<EvaluationResult> {
  const [itemProjection, glossaryProjection, reviewPage, reminders, rules, intents] =
    await Promise.all([
      system.projection.readProjection.execute('system.currentItems'),
      system.projection.readProjection.execute('system.glossary'),
      system.interpretation.listReviews.execute(),
      system.reminder.manage.list(),
      system.rule.store.list(),
      system.execution.store.listIntents(),
    ]);
  const components = (itemProjection.data as CurrentItemsResult).items
    .flatMap((item) => item.components as readonly ComponentRevision[])
    .filter((component) => component.evidence.some((evidence) => evidence.entryId === entryId));
  const items = (glossaryProjection.data as GlossaryResult).items;
  const profiles = (itemProjection.data as CurrentItemsResult).items
    .filter((item) =>
      (item.components as readonly ComponentRevision[]).some((component) =>
        component.evidence.some((evidence) => evidence.entryId === entryId),
      ),
    )
    .flatMap((item) => item.profile?.key ?? []);
  const attempts = (
    await Promise.all(intents.map((intent) => system.execution.store.listAttempts(intent.id)))
  ).flat();
  const reviews = reviewPage.items
    .filter((review) => review.entryId === entryId)
    .map((review) =>
      Object.freeze({
        reference: review.resolution.reference,
        question: review.resolution.question,
      }),
    );

  return Object.freeze({
    entryId,
    status: current,
    components: Object.freeze([...components]),
    items: Object.freeze([...items]),
    reviews: Object.freeze(reviews),
    runs: telemetry.runs,
    profiles: Object.freeze(profiles),
    reminders: Object.freeze([...reminders]),
    ruleCount: rules.length,
    intentCount: intents.length,
    attemptCount: attempts.length,
    adapterOutputs: Object.freeze(structuredClone(adapterOutputs)),
  });
}

function expectation(
  name: string,
  check: (result: EvaluationResult) => string | undefined,
): Expectation {
  return Object.freeze({ name, check });
}

function count(
  name: string,
  expected: number,
  read: (result: EvaluationResult) => number,
): Expectation {
  if (!Number.isInteger(expected) || expected < 0) {
    throw new Error(`Expected ${name} count must be a non-negative integer`);
  }

  return expectation(`${name} count is ${expected}`, (result) => {
    const actual = read(result);

    return actual === expected ? undefined : `Expected ${expected}, received ${actual}`;
  });
}

function collect(filter?: string): readonly EvaluationCase[] {
  if (registeredCases.length === 0) {
    throw new Error('Evaluation requires at least one registered case');
  }

  const cases = registeredCases.map(create);
  const selected = filter
    ? cases.filter((evaluationCase) =>
        evaluationCase.description.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
      )
    : cases;
  if (selected.length === 0) throw new Error(`No evaluation cases match "${filter}"`);
  return Object.freeze(selected);
}

function readRepeat(value = 1): number {
  return positiveInteger(value, 'repeat');
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`Evaluation ${name} must be a positive integer`);
  return value;
}

function passed(report: IterationReport): boolean {
  return report.error === undefined && report.checks.every((check) => check.passed);
}

function mark(passed: boolean): string {
  return paint(passed ? 'green' : 'red', passed ? 'PASS' : 'FAIL');
}

type Color = 'cyan' | 'dim' | 'green' | 'red' | 'yellow';

function paint(color: Color, value: string): string {
  if (!process.stdout.isTTY || process.env.NO_COLOR !== undefined) {
    return value;
  }

  const codes: Readonly<Record<Color, number>> = {
    cyan: 36,
    dim: 2,
    green: 32,
    red: 31,
    yellow: 33,
  };

  return `\u001B[${codes[color]}m${value}\u001B[0m`;
}

function isTerminal(status: EntryStatusResult['status']): boolean {
  return ['completed', 'pending', 'failed', 'exhausted'].includes(status);
}

function waitDuration(availableAt?: string): number {
  if (!availableAt) {
    return pollingIntervalMs;
  }

  return Math.max(pollingIntervalMs, Math.min(Date.parse(availableAt) - Date.now(), 1_000));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sum(runs: readonly InferenceRun[], key: 'inputTokens' | 'outputTokens'): number {
  return runs.reduce((total, run) => total + (run[key] ?? 0), 0);
}

function sameValues(actual: readonly string[], expected: readonly string[]): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function isStable(iterations: readonly IterationReport[]): boolean {
  const signatures = iterations.map((iteration) =>
    JSON.stringify({
      error: iteration.error,
      checks: iteration.checks.map((item) => ({ name: item.name, passed: item.passed })),
      status: iteration.result?.status.status,
      workflows: iteration.result?.status.workflows.map((workflow) => workflow.status),
      profiles: iteration.result?.profiles,
    }),
  );
  return new Set(signatures).size <= 1;
}

function providerUnavailable(iterations: readonly IterationReport[]): boolean {
  return (
    iterations.length > 0 &&
    iterations.every((iteration) => {
      const runs = iteration.result?.runs ?? [];
      return (
        runs.length > 0 &&
        runs.every((run) => run.result === 'error' && run.errorCategory === 'unavailable')
      );
    })
  );
}

class EvaluationTelemetry implements InferenceTelemetry {
  readonly #runs: InferenceRun[] = [];

  get runs(): readonly InferenceRun[] {
    return Object.freeze([...this.#runs]);
  }

  async record(run: InferenceRun): Promise<void> {
    this.#runs.push(run);
  }
}

class RecordingAdapter implements InterpretationAdapter {
  readonly #outputs: unknown[] = [];
  readonly identity;

  constructor(private readonly adapter: InterpretationAdapter) {
    this.identity = adapter.identity;
  }

  get outputs(): readonly unknown[] {
    return Object.freeze([...this.#outputs]);
  }

  async interpret(request: Parameters<InterpretationAdapter['interpret']>[0]): Promise<unknown> {
    try {
      const output = await this.adapter.interpret(request);
      this.#outputs.push(structuredClone(output));
      return output;
    } catch (error) {
      if (error instanceof InterpreterUnavailableError)
        throw new InterpreterUnavailableError(error.message);
      throw error;
    }
  }
}
