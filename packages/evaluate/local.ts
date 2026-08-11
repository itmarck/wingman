import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createAccessToken } from '../../src/adapters/http/auth.js';
import { createHttpServer } from '../../src/adapters/http/server.js';
import { RetryableInferenceError } from '../../src/modules/interpretation/services/interpreter.js';
import type { InterpretationRequest } from '../../src/modules/interpretation/services/request.js';
import { createSystem } from '../../src/system/system.js';
import { createMemoryTestStorage } from '../../src/system/tests/storage.js';
import { check, createQualityReport, type QualityCheck, type QualityReport } from './quality.js';

const signingSecret = 'local-quality-secret-with-at-least-32-characters';

/** Runs all deterministic quality checks without loading provider configuration. */
export async function runLocalQuality(): Promise<QualityReport> {
  const [http, simplicity, operational] = await Promise.all([
    inspectHttpContracts(),
    inspectSimplicity(),
    inspectOperationalSemantics(),
  ]);
  return createQualityReport('local', [
    ...operational,
    ...http,
    ...simplicity,
    ...evolutionChecks(),
  ]);
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
      'mixed knowledge and declarations remain independently observable',
      mixed.status === 'completed' &&
        mixed.declarations.filter((declaration) => declaration.status === 'applied').length === 2 &&
        successful.mixedHasKnowledge,
      `status=${mixed.status} declarations=${mixed.declarations.map((declaration) => declaration.status).join(',')} knowledge=${successful.mixedHasKnowledge}`,
      { weight: 2 },
    ),
    check(
      'semantic',
      'genuinely missing notification data does not execute',
      incomplete.declarationStatus === 'needsInput' && successful.automationCount === 1,
      `declarations=${incomplete.declarationStatus} totalAutomations=${successful.automationCount}`,
      { critical: true, weight: 2 },
    ),
    check(
      'observability',
      'incomplete declaration exposes stable identity and reason',
      incomplete.declarations.some(
        (declaration) =>
          declaration.reference === 'notification' &&
          declaration.kind === 'automation' &&
          declaration.status === 'needsInput' &&
          Boolean(declaration.reason),
      ),
      JSON.stringify(
        incomplete.declarations.map(({ reference, kind, status, reason }) => ({
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
      'invalid interpretation exhausts bounded short retries',
      invalid.status === 'exhausted' && Boolean(invalid.error) && invalid.attempts === 3,
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

interface PublicDeclaration {
  readonly reference: string;
  readonly kind: string;
  readonly status: string;
  readonly reason?: string;
}
interface PublicStatus {
  readonly status: string;
  readonly attempts: number;
  readonly error?: string;
  readonly declarationStatus: string;
  readonly declarations: readonly PublicDeclaration[];
}

async function runOperationalScenarios(): Promise<{
  readonly mixed: PublicStatus;
  readonly incomplete: PublicStatus;
  readonly mixedHasKnowledge: boolean;
  readonly automationCount: number;
}> {
  const system = createSystem(createMemoryTestStorage(), {
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await processIgnoringExpectedFailure(system);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2));
    }
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
      automationCount: (await system.automation.store.list()).length,
    };
  } finally {
    await server.close();
    await system.close();
  }
}

async function observeFailedInterpretation(
  adapter: InvalidQualityInterpreter | UnavailableQualityInterpreter,
): Promise<PublicStatus> {
  const system = createSystem(createMemoryTestStorage(), {
    inference: { target: 'quality.local', provider: 'local', model: 'failure-fixture' },
    adapter,
    mode: 'write',
    processing: {
      leaseDurationMs: 1_000,
      leaseRenewalIntervalMs: 100,
      pollingIntervalMs: 1,
      retryDelaysMs: {
        transient: [0, 1],
        quota: [0, 1],
        invalidResponse: [0, 1],
      },
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await processIgnoringExpectedFailure(system);
      const status = await system.interpretation.getEntryStatus.execute(id);

      if (status.status !== 'queued' || !status.availableAt) break;

      const waitMs = Math.max(1, Date.parse(status.availableAt) - Date.now() + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
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
): Promise<void> {
  try {
    await system.interpretation.processNext.execute();
  } catch {
    // The probe observes the persisted failure lifecycle after bounded attempts.
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
          declarations: operationalDeclarations(
            'Documentar la iniciativa Atlas',
            '2030-01-02T22:59:59.000Z',
          ),
        },
      };
    return {
      kind: 'knowledge' as const,
      draft: {
        entryId: request.entry.id,
        items: [],
        components: [],
        declarations: operationalDeclarations('Presentar el informe', '2030-01-02T09:00:00.000Z', [
          'schedule',
        ]),
      },
    };
  }
}

function operationalDeclarations(
  title: string,
  occurrence: string,
  unresolved: readonly string[] = [],
) {
  return {
    items: [
      {
        kind: 'item' as const,
        version: 1 as const,
        reference: 'task',
        dependsOn: [],
        unresolved: [],
        profile: { key: 'task', version: 1 },
        components: [
          { key: 'descriptive', version: 1, value: { title } },
          { key: 'temporal', version: 1, value: { dueAt: occurrence } },
        ],
      },
    ],
    states: [],
    intents: [],
    automations: [
      {
        kind: 'automation' as const,
        version: 1 as const,
        reference: 'notification',
        dependsOn: ['task'],
        unresolved,
        subjects: ['task'],
        given: [],
        when: {
          operator: { key: 'schedule' as const, version: 1 as const },
          occurrences: [occurrence],
        },
        thenIntents: [
          {
            capability: { key: 'notification', version: 1 },
            input: { message: title },
            conditions: [],
            expectedState: [],
            consent: 'none' as const,
            trigger: { kind: 'time' as const, value: occurrence },
          },
        ],
        controls: { maxOccurrences: 1, deduplication: 'trigger' as const },
      },
    ],
  };
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
    throw new RetryableInferenceError('transient', 'Synthetic provider unavailable', 0);
  }
}

async function inspectHttpContracts(): Promise<readonly QualityCheck[]> {
  const system = createSystem(createMemoryTestStorage(), {
    inference: { target: 'quality.local', provider: 'local', model: 'fixtures' },
    adapter: new OperationalQualityInterpreter(),
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
