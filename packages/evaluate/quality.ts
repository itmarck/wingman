export const qualityAxes = [
  'semantic',
  'simplicity',
  'observability',
  'httpContracts',
  'security',
  'evolution',
  'realModel',
] as const;

export type QualityAxis = (typeof qualityAxes)[number];
export type QualityOutcome = 'pass' | 'fail' | 'notRun';

export interface QualityCheck {
  readonly axis: QualityAxis;
  readonly name: string;
  readonly passed: boolean;
  readonly evidence: string;
  readonly weight?: number;
  readonly critical?: boolean;
}

export interface AxisReport {
  readonly axis: QualityAxis;
  readonly outcome: QualityOutcome;
  readonly score?: number;
  readonly threshold: number;
  readonly checks: readonly QualityCheck[];
}

export interface QualityReport {
  readonly lane: 'local' | 'real';
  readonly outcome: 'pass' | 'fail';
  readonly mayStop: boolean;
  readonly axes: readonly AxisReport[];
  readonly failures: readonly QualityCheck[];
  readonly metadata: Readonly<Record<string, string | number>>;
}

const thresholds: Readonly<Record<QualityAxis, number>> = Object.freeze({
  semantic: 90,
  simplicity: 90,
  observability: 90,
  httpContracts: 90,
  security: 90,
  evolution: 90,
  realModel: 80,
});

/** Scores registered evidence without knowing how any axis produced it. */
export function createQualityReport(
  lane: QualityReport['lane'],
  checks: readonly QualityCheck[],
  metadata: QualityReport['metadata'] = {},
): QualityReport {
  validateChecks(checks);
  const executed =
    lane === 'local' ? qualityAxes.filter((axis) => axis !== 'realModel') : ['realModel'];
  const axes = qualityAxes.map((axis): AxisReport => {
    const axisChecks = checks.filter((check) => check.axis === axis);
    if (!executed.includes(axis))
      return Object.freeze({ axis, outcome: 'notRun', threshold: thresholds[axis], checks: [] });
    const possible = axisChecks.reduce((total, check) => total + (check.weight ?? 1), 0);
    const earned = axisChecks.reduce(
      (total, check) => total + (check.passed ? (check.weight ?? 1) : 0),
      0,
    );
    const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
    const criticalFailure = axisChecks.some((check) => check.critical && !check.passed);
    return Object.freeze({
      axis,
      outcome: score >= thresholds[axis] && !criticalFailure ? 'pass' : 'fail',
      score,
      threshold: thresholds[axis],
      checks: Object.freeze(axisChecks),
    });
  });
  const required = axes.filter((axis) => axis.outcome !== 'notRun');
  const outcome =
    required.length > 0 && required.every((axis) => axis.outcome === 'pass') ? 'pass' : 'fail';
  const failures = checks
    .filter((check) => !check.passed)
    .sort(
      (left, right) =>
        Number(right.critical) - Number(left.critical) || (right.weight ?? 1) - (left.weight ?? 1),
    );
  return Object.freeze({
    lane,
    outcome,
    mayStop: outcome === 'pass',
    axes: Object.freeze(axes),
    failures: Object.freeze(failures),
    metadata: Object.freeze({ ...metadata }),
  });
}

/** Creates one immutable piece of scored evidence. */
export function check(
  axis: QualityAxis,
  name: string,
  passed: boolean,
  evidence: string,
  options: { readonly weight?: number; readonly critical?: boolean } = {},
): QualityCheck {
  return Object.freeze({ axis, name, passed, evidence, ...options });
}

export function printQuality(report: QualityReport, json = false): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  console.log(`Wingman quality gate (${report.lane})`);
  for (const axis of report.axes) {
    const score = axis.score === undefined ? '-' : String(axis.score);
    console.log(
      `${axis.outcome.toUpperCase().padEnd(6)} ${axis.axis.padEnd(14)} ${score}/${axis.threshold}`,
    );
    for (const item of axis.checks.filter((candidate) => !candidate.passed))
      console.log(`       ${item.critical ? 'CRITICAL ' : ''}${item.name}: ${item.evidence}`);
  }
  console.log(
    `Decision: ${report.mayStop ? 'thresholds met; loop may stop' : 'continue iterating'}`,
  );
}

function validateChecks(checks: readonly QualityCheck[]): void {
  const names = new Set<string>();
  for (const item of checks) {
    const identity = `${item.axis}:${item.name}`;
    if (names.has(identity)) throw new Error(`Duplicate quality check: ${identity}`);
    if (!item.name.trim() || !item.evidence.trim())
      throw new Error('Quality checks require names and evidence');
    if ((item.weight ?? 1) <= 0) throw new Error(`Quality check ${identity} has an invalid weight`);
    names.add(identity);
  }
}
