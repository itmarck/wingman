import { readFile } from 'node:fs/promises';
import { createAccessToken } from '../../src/adapters/http/auth.js';
import { createHttpServer } from '../../src/adapters/http/server.js';
import {
  expectationFor,
  materializeSmokeEntry,
  SmokeFixtureInterpreter,
} from '../../src/adapters/inference/smoke.js';
import { UnavailableNotificationAdapter } from '../../src/adapters/notification/unavailable.js';
import { PollingWorker } from '../../src/modules/interpretation/adapters/worker.js';
import { createSystem } from '../../src/system/system.js';

const signingSecret = 'isolated-smoke-secret-with-at-least-32-characters';
const bankPath = readBankPath(process.argv.slice(2));
const entries = parseEntries(await readFile(bankPath, 'utf8')).map(materializeSmokeEntry);
const missingFixtures = entries.filter((text) => !expectationFor(text));
if (missingFixtures.length > 0)
  throw new Error(`Missing smoke fixtures:\n${missingFixtures.join('\n')}`);

const system = createSystem('memory', {
  inference: { target: 'smoke.local', provider: 'local', model: 'fixtures' },
  adapter: new SmokeFixtureInterpreter(),
  notification: new UnavailableNotificationAdapter(),
  mode: 'write',
});
const server = createHttpServer(system, { signingSecret, logger: false });
const workerErrors: string[] = [];
const worker = new PollingWorker(system.interpretation.processNext, {
  interval: 5,
  onError: (error) => workerErrors.push(error instanceof Error ? error.message : String(error)),
});

try {
  await server.listen({ host: '127.0.0.1', port: 0 });
  worker.start();
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Smoke server has no TCP address');
  const base = `http://127.0.0.1:${address.port}/api`;
  const token = await createAccessToken('codex', signingSecret);
  const headers = {
    authorization: `Bearer ${token}`,
    'x-mutation-mode': 'write',
    'content-type': 'application/json',
  };
  await requireOk(await fetch(`${base}/health`), 'health');
  await requireOk(await fetch(`${base}/openapi.json`), 'openapi');

  const captured: { readonly id: string; readonly text: string }[] = [];
  for (const [index, text] of entries.entries()) {
    const response = await fetch(`${base}/entries`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ externalId: `smoke-${index + 1}`, content: { kind: 'text', text } }),
    });
    const body = (await requireOk(response, `capture ${index + 1}`)) as { readonly id: string };
    captured.push({ id: body.id, text });
  }

  const statuses = await Promise.all(
    captured.map(async (entry) => ({
      entry,
      status: await waitForStatus(base, headers, entry.id),
    })),
  );
  const projection = (await getJson(base, headers, '/projections/system.currentItems')) as {
    readonly data: { readonly items: readonly ProjectedItem[] };
  };
  const planning = (await getJson(base, headers, '/planning/pending')) as readonly PlanningRecord[];
  const results = [];
  for (const { entry, status } of statuses) {
    const expectation = expectationFor(entry.text);
    if (!expectation) throw new Error(`Missing smoke expectation for: ${entry.text}`);
    const actualProfiles = projection.data.items
      .filter((item) =>
        item.components.some((component) =>
          component.evidence.some((evidence) => evidence.entryId === entry.id),
        ),
      )
      .map((item) => item.profile?.key ?? 'knowledge');
    const actualStatuses = status.workflows.map((outcome) => outcome.status);
    const targetIds = new Set(
      status.workflows.flatMap((outcome) => (outcome.targetId ? [outcome.targetId] : [])),
    );
    const unresolved = [
      ...new Set([
        ...status.workflows.flatMap((outcome) =>
          Array.isArray(outcome.details?.unresolved)
            ? outcome.details.unresolved.filter(
                (value): value is string => typeof value === 'string',
              )
            : [],
        ),
        ...planning.filter((item) => targetIds.has(item.itemId)).flatMap((item) => item.unresolved),
      ]),
    ];
    const unsupported = status.workflows
      .filter((outcome) => outcome.status === 'unsupported')
      .map((outcome) => outcome.reason ?? 'unsupported');
    const mismatches = [
      ...difference('profiles', expectation.profiles, actualProfiles),
      ...difference('workflows', expectation.workflowStatuses, actualStatuses),
      ...difference('unresolved', expectation.unresolved, unresolved),
      ...(status.status === 'completed'
        ? []
        : [`status expected completed, received ${status.status}`]),
    ];
    results.push({
      text: entry.text,
      status: status.status,
      workflowStatus: status.workflowStatus,
      profiles: actualProfiles,
      workflows: actualStatuses,
      unresolved,
      unsupported,
      mismatches,
    });
  }

  const [entryPage, reminders, rules, proactive] = await Promise.all([
    getJson(base, headers, '/entries') as Promise<{ readonly items: readonly unknown[] }>,
    getJson(base, headers, '/reminders') as Promise<readonly unknown[]>,
    getJson(base, headers, '/rules') as Promise<readonly unknown[]>,
    getJson(base, headers, '/proactive-proposals') as Promise<readonly unknown[]>,
  ]);
  const intents = await system.execution.store.listIntents();
  const attempts = (
    await Promise.all(intents.map((intent) => system.execution.store.listAttempts(intent.id)))
  ).flat();
  const mismatches = results.flatMap((result) =>
    result.mismatches.map((value) => `${result.text}: ${value}`),
  );
  const expectedReminders = entries.reduce(
    (total, entry) => total + (expectationFor(entry)?.reminders ?? 0),
    0,
  );
  const expectedRules = entries.reduce(
    (total, entry) => total + (expectationFor(entry)?.rules ?? 0),
    0,
  );
  if (entryPage.items.length !== entries.length)
    mismatches.push(`entry count expected ${entries.length}, received ${entryPage.items.length}`);
  if (
    reminders.length !== expectedReminders ||
    rules.length !== expectedRules ||
    intents.length !== 0 ||
    attempts.length !== 0 ||
    proactive.length !== 0
  )
    mismatches.push(
      `effects expected reminders=${expectedReminders} rules=${expectedRules} intents=0 attempts=0 proactive=0; received reminders=${reminders.length} rules=${rules.length} intents=${intents.length} attempts=${attempts.length} proactive=${proactive.length}`,
    );
  if (workerErrors.length > 0) mismatches.push(...workerErrors.map((error) => `worker: ${error}`));
  const report = {
    mode: 'isolated-memory',
    deterministicInference: true,
    entries: results,
    totals: {
      captured: entryPage.items.length,
      needsInput: results.filter((result) => result.workflowStatus === 'needsInput').length,
      unsupported: results.filter((result) => result.workflowStatus === 'unsupported').length,
      failedWorkflows: results.filter((result) => result.workflowStatus === 'failed').length,
      reminders: reminders.length,
      rules: rules.length,
      intents: intents.length,
      attempts: attempts.length,
      proactive: proactive.length,
      mismatches: mismatches.length,
    },
    mismatches,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (mismatches.length > 0) process.exitCode = 1;
} finally {
  await server.close();
  await worker.stop();
  await system.close();
}

interface StatusResponse {
  readonly status: string;
  readonly workflowStatus: string;
  readonly workflows: readonly {
    readonly kind: string;
    readonly status: string;
    readonly targetId?: string;
    readonly reason?: string;
    readonly details?: { readonly unresolved?: readonly unknown[] };
  }[];
}
interface ProjectedItem {
  readonly profile?: { readonly key: string };
  readonly components: readonly { readonly evidence: readonly { readonly entryId: string }[] }[];
}
interface PlanningRecord {
  readonly itemId: string;
  readonly unresolved: readonly string[];
}
async function waitForStatus(
  base: string,
  headers: Record<string, string>,
  entryId: string,
): Promise<StatusResponse> {
  for (let attempt = 0; attempt < 250; attempt++) {
    const status = (await getJson(base, headers, `/entries/${entryId}/status`)) as StatusResponse;
    if (['completed', 'failed', 'exhausted', 'pending'].includes(status.status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Entry ${entryId} did not reach a terminal status`);
}
async function getJson(
  base: string,
  headers: Record<string, string>,
  path: string,
): Promise<unknown> {
  return requireOk(await fetch(`${base}${path}`, { headers }), path);
}
async function requireOk(response: Response, label: string): Promise<unknown> {
  const body = await response.json();
  if (!response.ok)
    throw new Error(`${label} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}
function difference(
  label: string,
  expected: readonly string[],
  actual: readonly string[],
): readonly string[] {
  return JSON.stringify([...expected].sort()) === JSON.stringify([...actual].sort())
    ? []
    : [`${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`];
}
function parseEntries(markdown: string): readonly string[] {
  return Object.freeze(
    markdown
      .split(/\r?\n/)
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2)),
  );
}
function readBankPath(arguments_: readonly string[]): string {
  const position = arguments_.indexOf('--entries');
  return position >= 0
    ? (arguments_[position + 1] ?? fail('--entries requires a path'))
    : 'docs/entries.md';
}
function fail(message: string): never {
  throw new Error(message);
}
