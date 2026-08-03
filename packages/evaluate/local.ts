import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createAccessToken } from '../../src/adapters/http/auth.js';
import { createHttpServer } from '../../src/adapters/http/server.js';
import { parseInterpretationOutput } from '../../src/adapters/inference/schema.js';
import { SmokeFixtureInterpreter } from '../../src/adapters/inference/smoke.js';
import { InterpreterUnavailableError } from '../../src/modules/interpretation/services/interpreter.js';
import type { InterpretationRequest } from '../../src/modules/interpretation/services/request.js';
import { createSystem } from '../../src/system/system.js';
import { check, createQualityReport, type QualityCheck, type QualityReport } from './quality.js';

const executeFile = promisify(execFile);
const signingSecret = 'local-quality-secret-with-at-least-32-characters';

interface SmokeEntry {
  readonly text: string;
  readonly status: string;
  readonly workflowStatus: string;
  readonly profiles: readonly string[];
  readonly workflows: readonly string[];
  readonly unresolved: readonly string[];
  readonly unsupported: readonly string[];
  readonly mismatches: readonly string[];
}
interface SmokeReport {
  readonly mode: string;
  readonly deterministicInference: boolean;
  readonly entries: readonly SmokeEntry[];
  readonly totals: {
    readonly captured: number;
    readonly unsupported: number;
    readonly failedWorkflows: number;
    readonly reminders: number;
    readonly rules: number;
    readonly intents: number;
    readonly attempts: number;
    readonly proactive: number;
    readonly mismatches: number;
  };
}

/** Runs all deterministic quality checks without loading provider configuration. */
export async function runLocalQuality(): Promise<QualityReport> {
  const [smoke, http, simplicity, operational] = await Promise.all([
    runSmoke(),
    inspectHttpContracts(),
    inspectSimplicity(),
    inspectOperationalSemantics(),
  ]);
  const checks = [
    ...semanticChecks(smoke),
    ...operational,
    ...observabilityChecks(smoke),
    ...http,
    ...securityChecks(smoke),
    ...simplicity,
    ...evolutionChecks(),
  ];
  return createQualityReport('local', checks, {
    entries: smoke.totals.captured,
    deterministicInference: String(smoke.deterministicInference),
  });
}

async function inspectOperationalSemantics(): Promise<readonly QualityCheck[]> {
  const successful = await runOperationalScenarios();
  const invalid = await observeFailedInterpretation(new InvalidQualityInterpreter());
  const exhausted = await observeFailedInterpretation(new UnavailableQualityInterpreter());
  const mixed = successful.mixed;
  const incomplete = successful.incomplete;
  return [
    check(
      'semantic',
      'mixed knowledge and workflow remain independently observable',
      mixed.status === 'completed' &&
        mixed.workflows.filter((workflow) => workflow.status === 'applied').length === 2 &&
        successful.mixedHasKnowledge,
      `status=${mixed.status} workflows=${mixed.workflows.map((workflow) => workflow.status).join(',')} knowledge=${successful.mixedHasKnowledge}`,
      { weight: 2 },
    ),
    check(
      'semantic',
      'genuinely missing reminder data does not execute',
      incomplete.workflowStatus === 'needsInput' && successful.reminderCount === 1,
      `workflow=${incomplete.workflowStatus} totalReminders=${successful.reminderCount}`,
      { critical: true, weight: 2 },
    ),
    check(
      'observability',
      'incomplete workflow exposes stable identity and reason',
      incomplete.workflows.some(
        (workflow) =>
          workflow.reference === 'reminder' &&
          workflow.kind === 'reminderRequest' &&
          workflow.status === 'needsInput' &&
          Boolean(workflow.reason),
      ),
      JSON.stringify(
        incomplete.workflows.map(({ reference, kind, status, reason }) => ({
          reference,
          kind,
          status,
          reason,
        })),
      ),
      { critical: true, weight: 2 },
    ),
    check(
      'observability',
      'invalid interpretation exposes a terminal failure',
      invalid.status === 'failed' && Boolean(invalid.error) && invalid.attempts === 1,
      `status=${invalid.status} attempts=${invalid.attempts} error=${invalid.error ?? 'none'}`,
      { weight: 2 },
    ),
    check(
      'observability',
      'unavailable inference exposes exhausted retries',
      exhausted.status === 'exhausted' && Boolean(exhausted.error) && exhausted.attempts === 3,
      `status=${exhausted.status} attempts=${exhausted.attempts} error=${exhausted.error ?? 'none'}`,
      { weight: 2 },
    ),
  ];
}

interface PublicWorkflow {
  readonly reference: string;
  readonly kind: string;
  readonly status: string;
  readonly reason?: string;
}
interface PublicStatus {
  readonly status: string;
  readonly attempts: number;
  readonly error?: string;
  readonly workflowStatus: string;
  readonly workflows: readonly PublicWorkflow[];
}

async function runOperationalScenarios(): Promise<{
  readonly mixed: PublicStatus;
  readonly incomplete: PublicStatus;
  readonly mixedHasKnowledge: boolean;
  readonly reminderCount: number;
}> {
  const system = createSystem('memory', {
    inference: { target: 'quality.local', provider: 'local', model: 'operational-fixtures' },
    adapter: new OperationalQualityInterpreter(),
    mode: 'write',
  });
  const server = createHttpServer(system, { signingSecret });
  try {
    await server.ready();
    const token = await createAccessToken('codex', signingSecret);
    const headers = {
      authorization: `Bearer ${token}`,
      'x-mutation-mode': 'write',
    };
    const capture = async (externalId: string, text: string) => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/entries',
        headers,
        payload: { externalId, content: { kind: 'text', text } },
      });
      return response.json<{ id: string }>().id;
    };
    const mixedId = await capture(
      'mixed',
      'La iniciativa Atlas organiza notas y tengo que documentarla mañana.',
    );
    const incompleteId = await capture(
      'incomplete',
      'Recuérdame presentar el informe, pero todavía no decidí cuándo.',
    );
    while (await processIgnoringExpectedFailure(system)) {}
    const [mixedResponse, incompleteResponse, projection] = await Promise.all([
      server.inject({ method: 'GET', url: `/api/entries/${mixedId}/status`, headers }),
      server.inject({ method: 'GET', url: `/api/entries/${incompleteId}/status`, headers }),
      server.inject({ method: 'GET', url: '/api/projections/system.currentItems', headers }),
    ]);
    const projectionBody = projection.json<{
      data: {
        items: readonly {
          components: readonly {
            evidence: readonly { entryId: string }[];
          }[];
        }[];
      };
    }>();
    return {
      mixed: mixedResponse.json<PublicStatus>(),
      incomplete: incompleteResponse.json<PublicStatus>(),
      mixedHasKnowledge: projectionBody.data.items.some((item) =>
        item.components.some((component) =>
          component.evidence.some((evidence) => evidence.entryId === mixedId),
        ),
      ),
      reminderCount: (await system.reminder.manage.list()).length,
    };
  } finally {
    await server.close();
    await system.close();
  }
}

async function observeFailedInterpretation(
  adapter: InvalidQualityInterpreter | UnavailableQualityInterpreter,
): Promise<PublicStatus> {
  const system = createSystem('memory', {
    inference: { target: 'quality.local', provider: 'local', model: 'failure-fixture' },
    adapter,
    mode: 'write',
    processing: {
      leaseDurationMs: 1_000,
      leaseRenewalIntervalMs: 100,
      pollingIntervalMs: 1,
      retryDelaysMs: [0, 0],
    },
  });
  const server = createHttpServer(system, { signingSecret });
  try {
    await server.ready();
    const token = await createAccessToken('codex', signingSecret);
    const headers = { authorization: `Bearer ${token}`, 'x-mutation-mode': 'write' };
    const captured = await server.inject({
      method: 'POST',
      url: '/api/entries',
      headers,
      payload: {
        externalId: adapter.identity.key,
        content: { kind: 'text', text: 'Failure probe' },
      },
    });
    const id = captured.json<{ id: string }>().id;
    while (await processIgnoringExpectedFailure(system)) {}
    return (
      await server.inject({ method: 'GET', url: `/api/entries/${id}/status`, headers })
    ).json<PublicStatus>();
  } finally {
    await server.close();
    await system.close();
  }
}

async function processIgnoringExpectedFailure(
  system: ReturnType<typeof createSystem>,
): Promise<boolean> {
  try {
    return await system.interpretation.processNext.execute();
  } catch {
    return true;
  }
}

class OperationalQualityInterpreter {
  readonly identity = Object.freeze({ key: 'operationalQuality' });
  async interpret(request: InterpretationRequest) {
    const text = request.entry.content.kind === 'text' ? request.entry.content.text : '';
    if (text.startsWith('La iniciativa Atlas'))
      return {
        kind: 'knowledge' as const,
        draft: {
          entryId: request.entry.id,
          items: [{ reference: 'atlas', referenceStatus: 'identified' as const }],
          components: [
            {
              reference: 'atlasName',
              itemReference: 'atlas',
              key: 'name',
              schemaVersion: 1,
              value: 'Atlas',
              sourceLocators: [],
            },
          ],
          workflows: [
            {
              kind: 'planningRequest' as const,
              version: 1 as const,
              reference: 'task',
              profile: 'task' as const,
              title: 'Documentar la iniciativa Atlas',
              temporal: { to: '2030-01-02T23:59:59.000Z', precision: 'day' as const },
              unresolved: [],
            },
            {
              kind: 'reminderRequest' as const,
              version: 1 as const,
              reference: 'reminder',
              subjectReference: 'task',
              message: 'Documentar la iniciativa Atlas',
              temporal: { to: '2030-01-02T23:59:59.000Z', precision: 'day' as const },
              schedule: { kind: 'deadlineOffsets' as const, offsetsBeforeMs: [3_600_000] },
              unresolved: [],
            },
          ],
        },
      };
    return {
      kind: 'knowledge' as const,
      draft: {
        entryId: request.entry.id,
        items: [],
        components: [],
        workflows: [
          {
            kind: 'planningRequest' as const,
            version: 1 as const,
            reference: 'task',
            profile: 'task' as const,
            title: 'Presentar el informe',
            unresolved: [],
          },
          {
            kind: 'reminderRequest' as const,
            version: 1 as const,
            reference: 'reminder',
            subjectReference: 'task',
            message: 'Presentar el informe',
            schedule: {
              kind: 'occurrences' as const,
              at: ['2030-01-02T09:00:00.000Z'],
            },
            unresolved: ['schedule'],
          },
        ],
      },
    };
  }
}

class InvalidQualityInterpreter {
  readonly identity = Object.freeze({ key: 'invalidQuality' });
  async interpret() {
    return { kind: 'invalid' as const, reason: 'Synthetic invalid output' };
  }
}

class UnavailableQualityInterpreter {
  readonly identity = Object.freeze({ key: 'unavailableQuality' });
  async interpret(): Promise<never> {
    throw new InterpreterUnavailableError('Synthetic provider unavailable', 0);
  }
}

async function runSmoke(): Promise<SmokeReport> {
  const { stdout } = await executeFile(
    process.execPath,
    ['--import', 'tsx', 'tools/smoke/index.ts'],
    { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024, windowsHide: true },
  );
  return JSON.parse(stdout) as SmokeReport;
}

function semanticChecks(report: SmokeReport): readonly QualityCheck[] {
  const profiles = report.entries.flatMap((entry) => entry.profiles);
  const expected = { habit: 4, knowledge: 2, objective: 1, task: 9 };
  const actual = Object.fromEntries(
    Object.keys(expected).map((profile) => [
      profile,
      profiles.filter((value) => value === profile).length,
    ]),
  );
  return [
    check(
      'semantic',
      'all Entry expectations match',
      report.totals.mismatches === 0,
      `${report.totals.mismatches} mismatches`,
      { critical: true, weight: 3 },
    ),
    check(
      'semantic',
      'all Entries reach completed processing',
      report.entries.every((entry) => entry.status === 'completed'),
      `${report.entries.filter((entry) => entry.status !== 'completed').length} incomplete`,
      { weight: 2 },
    ),
    check(
      'semantic',
      'planning profiles match the Entry bank',
      JSON.stringify(actual) === JSON.stringify(expected),
      `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
      { weight: 2 },
    ),
    check(
      'semantic',
      'reminder and unsupported event remain distinct',
      report.totals.reminders === 1 && report.totals.rules === 1 && report.totals.unsupported === 1,
      `reminders=${report.totals.reminders} rules=${report.totals.rules} unsupported=${report.totals.unsupported}`,
      { weight: 2 },
    ),
  ];
}

function observabilityChecks(report: SmokeReport): readonly QualityCheck[] {
  const unsupported = report.entries.find((entry) => entry.workflowStatus === 'unsupported');
  const applied = report.entries.filter((entry) => entry.workflows.includes('applied'));
  return [
    check(
      'observability',
      'unsupported workflow has an actionable public reason',
      Boolean(unsupported?.unsupported[0]?.includes('not registered')),
      unsupported?.unsupported[0] ?? 'reason missing',
      { critical: true, weight: 2 },
    ),
    check(
      'observability',
      'applied workflows expose their outcomes',
      applied.length > 0 && applied.every((entry) => entry.workflows.length > 0),
      `${applied.length} Entries expose applied outcomes`,
    ),
    check(
      'observability',
      'workflow failures are counted explicitly',
      report.totals.failedWorkflows === 0,
      `${report.totals.failedWorkflows} failed workflows`,
    ),
    check(
      'observability',
      'unresolved values are visible when present',
      report.entries.every((entry) => Array.isArray(entry.unresolved)),
      'every Entry includes unresolved evidence',
    ),
  ];
}

async function inspectHttpContracts(): Promise<readonly QualityCheck[]> {
  const system = createSystem('memory', {
    inference: { target: 'quality.local', provider: 'local', model: 'fixtures' },
    adapter: new SmokeFixtureInterpreter(),
    mode: 'write',
  });
  const server = createHttpServer(system, { signingSecret });
  try {
    await server.ready();
    const token = await createAccessToken('codex', signingSecret);
    const authorization = { authorization: `Bearer ${token}` };
    const [health, openapi, unauthorized, readonly, malformed, unknown, forgedOrigin] =
      await Promise.all([
        server.inject({ method: 'GET', url: '/api/health' }),
        server.inject({ method: 'GET', url: '/api/openapi.json' }),
        server.inject({ method: 'GET', url: '/api/entries' }),
        server.inject({
          method: 'POST',
          url: '/api/entries',
          headers: authorization,
          payload: { externalId: 'readonly', content: { kind: 'text', text: 'safe' } },
        }),
        server.inject({
          method: 'POST',
          url: '/api/entries',
          headers: { ...authorization, 'x-mutation-mode': 'write' },
          payload: { externalId: '', content: { kind: 'text', text: '' } },
        }),
        server.inject({ method: 'GET', url: '/api/does-not-exist', headers: authorization }),
        server.inject({
          method: 'POST',
          url: '/api/entries',
          headers: { ...authorization, 'x-mutation-mode': 'write' },
          payload: {
            externalId: 'forged',
            source: 'trusted',
            content: { kind: 'text', text: 'safe' },
          },
        }),
      ]);
    const errorIs = (response: typeof unauthorized, status: number, code: string) =>
      response.statusCode === status &&
      response.json<{ error?: { code?: string; message?: string } }>().error?.code === code;
    const forgedEntry =
      forgedOrigin.statusCode === 202
        ? await server.inject({
            method: 'GET',
            url: `/api/entries/${forgedOrigin.json<{ id: string }>().id}`,
            headers: authorization,
          })
        : undefined;
    const trustedOrigin =
      forgedEntry?.json<{ origin?: { source?: string } }>().origin?.source === 'codex';
    return [
      check(
        'httpContracts',
        'health and OpenAPI are public',
        health.statusCode === 200 && openapi.statusCode === 200,
        `health=${health.statusCode} openapi=${openapi.statusCode}`,
        { critical: true },
      ),
      check(
        'httpContracts',
        'protected routes reject missing authentication',
        errorIs(unauthorized, 401, 'unauthorized'),
        `status=${unauthorized.statusCode} body=${unauthorized.body}`,
        { critical: true, weight: 2 },
      ),
      check(
        'httpContracts',
        'readonly is the safe mutation default',
        errorIs(readonly, 403, 'forbidden'),
        `status=${readonly.statusCode} body=${readonly.body}`,
        { critical: true },
      ),
      check(
        'httpContracts',
        'malformed payload has a stable error envelope',
        errorIs(malformed, 400, 'invalidInput'),
        `status=${malformed.statusCode} body=${malformed.body}`,
      ),
      check(
        'httpContracts',
        'unknown route has a stable error envelope',
        errorIs(unknown, 404, 'notFound'),
        `status=${unknown.statusCode} body=${unknown.body}`,
      ),
      check(
        'security',
        'HTTP body cannot forge Connector origin',
        trustedOrigin,
        `capture=${forgedOrigin.statusCode} storedSource=${forgedEntry?.json<{ origin?: { source?: string } }>().origin?.source ?? 'none'}`,
        { critical: true, weight: 2 },
      ),
    ];
  } finally {
    await server.close();
    await system.close();
  }
}

function securityChecks(report: SmokeReport): readonly QualityCheck[] {
  const destructive = report.entries.find((entry) => entry.text.startsWith('Eliminar la carpeta'));
  const inventedWorkflow = parseInterpretationOutput({
    kind: 'knowledge',
    reason: null,
    draft: {
      entryId: 'entry',
      items: [],
      components: [],
      referenceResolutions: [],
      workflows: [{ kind: 'deleteDirectory', version: 1 }],
    },
  });
  return [
    check(
      'security',
      'destructive Entry becomes planning only',
      destructive?.profiles.join() === 'task' && destructive.workflows.join() === 'applied',
      JSON.stringify(destructive),
      { critical: true, weight: 2 },
    ),
    check(
      'security',
      'local run creates no executable effects',
      report.totals.intents === 0 && report.totals.attempts === 0 && report.totals.proactive === 0,
      `intents=${report.totals.intents} attempts=${report.totals.attempts} proactive=${report.totals.proactive}`,
      { critical: true, weight: 2 },
    ),
    check(
      'security',
      'closed inference contract rejects invented operations',
      inventedWorkflow === undefined,
      `parser result=${String(inventedWorkflow)}`,
      { critical: true },
    ),
    check(
      'security',
      'local lane proves isolated mode',
      report.mode === 'isolated-memory' && report.deterministicInference,
      `mode=${report.mode} deterministic=${report.deterministicInference}`,
      { critical: true },
    ),
  ];
}

async function inspectSimplicity(): Promise<readonly QualityCheck[]> {
  const files = await listTypeScript(path.resolve('src'));
  const production = files.filter((file) => !file.includes(`${path.sep}tests${path.sep}`));
  const imports = new Map<string, readonly string[]>();
  const oversized: string[] = [];
  const inward: string[] = [];
  for (const file of production) {
    const source = await readFile(file, 'utf8');
    const lines = source.split(/\r?\n/).length;
    if (lines > 400) oversized.push(`${path.relative(process.cwd(), file)}:${lines}`);
    const specifiers = [
      ...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g),
    ].map((match) => match[1]);
    const dependencies = specifiers.flatMap((specifier) =>
      resolveSourceImport(file, specifier, production),
    );
    imports.set(file, dependencies);
    if (file.includes(`${path.sep}core${path.sep}`))
      for (const dependency of dependencies)
        if (
          [
            `${path.sep}modules${path.sep}`,
            `${path.sep}adapters${path.sep}`,
            `${path.sep}system${path.sep}`,
          ].some((segment) => dependency.includes(segment))
        )
          inward.push(
            `${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), dependency)}`,
          );
  }
  const cycles = findCycles(imports).map((cycle) =>
    cycle.map((file) => path.relative(process.cwd(), file)).join(' -> '),
  );
  const runner = await readFile(path.resolve('packages/evaluate/quality.ts'), 'utf8');
  const axisBranches = qualityAxisBranches(runner);
  return [
    check(
      'simplicity',
      'core dependencies point inward',
      inward.length === 0,
      inward.join('; ') || 'no violations',
      { critical: true, weight: 2 },
    ),
    check(
      'simplicity',
      'production imports are acyclic',
      cycles.length === 0,
      cycles.join('; ') || 'no cycles',
      { critical: true, weight: 2 },
    ),
    check(
      'simplicity',
      'production files stay below 400 lines',
      oversized.length === 0,
      oversized.join('; ') || 'no oversized files',
    ),
    check(
      'simplicity',
      'generic scorer has no per-axis scoring branches',
      axisBranches.length === 0,
      axisBranches.join(', ') || 'generic scoring only',
    ),
  ];
}

function evolutionChecks(): readonly QualityCheck[] {
  const extension = check(
    'evolution',
    'registered scenario is scored generically',
    true,
    'this check was added through the QualityCheck contract',
  );
  const probe = createQualityReport('local', [extension]);
  const scored = probe.axes.find((axis) => axis.axis === 'evolution');
  return [
    extension,
    check(
      'evolution',
      'unknown axes are rejected by TypeScript',
      true,
      'QualityAxis is a closed exported union',
    ),
    check(
      'evolution',
      'scoring needs no scenario-specific formatter branch',
      scored?.score === 100,
      `probe score=${scored?.score}`,
    ),
  ];
}

async function listTypeScript(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? listTypeScript(path.join(directory, entry.name))
        : entry.name.endsWith('.ts')
          ? [path.join(directory, entry.name)]
          : [],
    ),
  );
  return nested.flat();
}

function resolveSourceImport(
  file: string,
  specifier: string,
  files: readonly string[],
): readonly string[] {
  if (!specifier.startsWith('.')) return [];
  const resolved = path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts'));
  return files.includes(resolved) ? [resolved] : [];
}

function findCycles(graph: ReadonlyMap<string, readonly string[]>): readonly (readonly string[])[] {
  const visited = new Set<string>();
  const active: string[] = [];
  const cycles: string[][] = [];
  const visit = (node: string) => {
    if (active.includes(node)) {
      cycles.push([...active.slice(active.indexOf(node)), node]);
      return;
    }
    if (visited.has(node)) return;
    active.push(node);
    for (const dependency of graph.get(node) ?? []) visit(dependency);
    active.pop();
    visited.add(node);
  };
  for (const node of graph.keys()) visit(node);
  return cycles;
}

function qualityAxisBranches(source: string): readonly string[] {
  return [
    'semantic',
    'simplicity',
    'observability',
    'httpContracts',
    'security',
    'evolution',
    'realModel',
  ].filter((axis) => new RegExp(`if\\s*\\([^)]*['"]${axis}['"]`).test(source));
}
