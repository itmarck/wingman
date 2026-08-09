import './cases/quotes.js';
import './cases/reviews.js';
import './cases/declarations.js';
import { readOption, readPositiveInteger } from './cli.js';
import { runLocalQuality } from './local.js';
import { check, createQualityReport, printQuality } from './quality.js';
import { run } from './runner.js';

const arguments_ = process.argv.slice(2);
const repeat = readPositiveInteger(arguments_, '--repeat', 1);
const filter = readOption(arguments_, '--case');
const timeoutMs = readPositiveInteger(arguments_, '--timeout-ms', 30_000);
const maxAttempts = readPositiveInteger(arguments_, '--attempts', 2);
const allowed = new Set(['--json', '--repeat', '--case', '--timeout-ms', '--attempts']);
for (const argument of arguments_)
  if (!argument.includes('=') && argument.startsWith('--') && !allowed.has(argument))
    throw new Error(`Unknown evaluation option: ${argument}`);

const local = await runLocalQuality();

const evaluation = await run({ repeat, filter, timeoutMs, maxAttempts });
const checks = evaluation.cases.map((evaluationCase) => {
  const failures = evaluationCase.iterations.flatMap((iteration) => [
    ...(iteration.error ? [iteration.error] : []),
    ...(iteration.result?.status.error ? [`processing=${iteration.result.status.error}`] : []),
    ...(iteration.result?.status.error && iteration.result.adapterOutputs.length > 0
      ? [`output=${summarize(iteration.result.adapterOutputs.at(-1))}`]
      : []),
    ...iteration.checks.flatMap((item) => (item.passed ? [] : [item.message ?? item.name])),
    ...(iteration.checks.some((item) => !item.passed) && iteration.result?.adapterOutputs.length
      ? [`output=${summarize(iteration.result.adapterOutputs.at(-1))}`]
      : []),
  ]);
  const critical = /quote|destructive/i.test(evaluationCase.description);
  return check(
    'realModel',
    evaluationCase.description,
    evaluationCase.failed === 0 && evaluationCase.stable,
    failures.join('; ') || `${evaluationCase.passed}/${repeat} repetitions passed`,
    { critical, weight: critical ? 2 : 1 },
  );
});
const runs = evaluation.cases.flatMap((evaluationCase) =>
  evaluationCase.iterations.flatMap((iteration) => iteration.result?.runs ?? []),
);
const report = createQualityReport(
  'complete',
  [...local.axes.flatMap((axis) => axis.checks), ...checks],
  {
    ...local.metadata,
    target: evaluation.target,
    model: evaluation.model,
    repeat,
    cases: evaluation.cases.length,
    unstable: evaluation.unstable,
    attempts: runs.length,
    inferenceErrors: runs.filter((run) => run.result === 'error').length,
    inputTokens: sum(runs, 'inputTokens'),
    outputTokens: sum(runs, 'outputTokens'),
    durationMs: runs.reduce((total, run) => total + run.durationMs, 0),
    timeoutMs,
    maxAttempts,
    ...(evaluation.blocked ? { blocker: evaluation.blocked } : {}),
  },
);
printQuality(report, arguments_.includes('--json'));

if (!report.mayStop) process.exitCode = 1;

function sum(
  runs: readonly { readonly inputTokens?: number; readonly outputTokens?: number }[],
  key: 'inputTokens' | 'outputTokens',
): number {
  return runs.reduce((total, run) => total + (run[key] ?? 0), 0);
}

function summarize(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized.length > 1_000 ? `${serialized.slice(0, 1_000)}...` : serialized;
}
