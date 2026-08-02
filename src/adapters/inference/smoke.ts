import type { PlanningProfile } from '../../core/planning/lifecycle.js';
import type { RegisterInterpretationInput } from '../../modules/interpretation/domain/input.js';
import type { InterpretationRequest } from '../../modules/interpretation/services/request.js';

export interface SmokeExpectation {
  readonly profiles: readonly (PlanningProfile | 'knowledge')[];
  readonly workflowStatuses: readonly ('applied' | 'needsInput' | 'unsupported')[];
}

interface SmokeScenario {
  readonly text: string;
  readonly expectation: SmokeExpectation;
  draft(request: InterpretationRequest): RegisterInterpretationInput;
}

export class SmokeFixtureInterpreter {
  readonly identity = Object.freeze({ key: 'smokeFixtures' });
  async interpret(request: InterpretationRequest) {
    const scenario = scenarios.get(entryText(request));
    return scenario
      ? { kind: 'knowledge' as const, draft: scenario.draft(request) }
      : { kind: 'invalid' as const, reason: `No smoke fixture for: ${entryText(request)}` };
  }
}

export function expectationFor(text: string): SmokeExpectation | undefined {
  return scenarios.get(text)?.expectation;
}

const definitions: readonly SmokeScenario[] = [
  reminderBeforeMonthEnd(
    'Recuérdame anular la tarjeta de crédito {bankName} antes de fin de mes',
    'Anular la tarjeta de crédito {bankName}',
    ['{bankName}'],
  ),
  planning(
    'Tengo que llamar a {name} para agendar una cita',
    'task',
    'Llamar a {name} para agendar una cita',
    { unresolved: ['{name}'] },
  ),
  eventReminder(
    'Avísame cuando llegue un correo de {company} porque es urgente',
    'Atender correo urgente de {company}',
    ['{company}'],
  ),
  planning(
    'Necesito que {system} sirva para documentarse a sí mismo también',
    'objective',
    'Hacer que {system} se documente a sí mismo',
    { unresolved: ['{system}'] },
  ),
  planning(
    'Todavía no he sacado consulta para {specialty}',
    'task',
    'Sacar consulta para {specialty}',
    { unresolved: ['{specialty}'] },
  ),
  planning('Caminar después de comer', 'habit', 'Caminar después de comer', {
    recurrence: 'después de comer',
  }),
  planning(
    'Definir una rutina simple y corta de ejercicios al día',
    'habit',
    'Realizar una rutina simple y corta de ejercicios',
    { recurrence: 'daily' },
  ),
  planning(
    'Conversar en inglés unos 15 minutos al día para no perder practica',
    'habit',
    'Conversar en inglés unos 15 minutos',
    { recurrence: 'daily' },
  ),
  knowledge(
    'Plataforma de cursos interactivos como idea',
    'Plataforma de cursos interactivos',
    'Idea de una plataforma de cursos interactivos',
  ),
  planning(
    'Eliminar la carpeta overrides en {projectName}',
    'task',
    'Eliminar la carpeta overrides en {projectName}',
    { unresolved: ['{projectName}'] },
  ),
  planning('Ver {movieName}', 'task', 'Ver {movieName}', { unresolved: ['{movieName}'] }),
  planning('Hacer un menú semanal', 'task', 'Hacer un menú semanal', { recurrence: 'weekly' }),
  planning(
    'Definir una hora en el día para releer cosas de las que quiero aprender para reforzar',
    'habit',
    'Releer cosas para reforzar el aprendizaje',
    { recurrence: 'daily; time unspecified' },
  ),
  planning(
    'Revisar el mensaje de {name} en slack',
    'task',
    'Revisar el mensaje de {name} en Slack',
    { unresolved: ['{name}'] },
  ),
  planning('Amortizar hipoteca', 'task', 'Amortizar hipoteca'),
  quote('"Uno sufre más en la imaginación que en la realidad"'),
];

const scenarios = new Map(definitions.map((scenario) => [scenario.text, scenario]));

function planning(
  text: string,
  profile: PlanningProfile,
  title: string,
  options: { readonly recurrence?: string; readonly unresolved?: readonly string[] } = {},
): SmokeScenario {
  return {
    text,
    expectation: { profiles: [profile], workflowStatuses: ['applied'] },
    draft: (request) => ({
      entryId: request.entry.id,
      items: [],
      components: [],
      workflows: [
        {
          kind: 'planningRequest',
          version: 1,
          reference: 'planning',
          profile,
          title,
          recurrence: options.recurrence,
          unresolved: options.unresolved ?? [],
        },
      ],
    }),
  };
}

function reminderBeforeMonthEnd(
  text: string,
  title: string,
  unresolved: readonly string[],
): SmokeScenario {
  return {
    text,
    expectation: { profiles: ['task'], workflowStatuses: ['applied', 'needsInput'] },
    draft(request) {
      const to = endOfMonth(request.entry.capturedAt);
      return {
        entryId: request.entry.id,
        items: [],
        components: [],
        workflows: [
          {
            kind: 'planningRequest',
            version: 1,
            reference: 'subject',
            profile: 'task',
            title,
            temporal: { to, precision: 'month' },
            unresolved,
          },
          {
            kind: 'reminderRequest',
            version: 1,
            reference: 'reminder',
            subjectReference: 'subject',
            message: title,
            temporal: { to, precision: 'month' },
            schedule: { kind: 'deadlineOffsets', offsetsBeforeMs: [86_400_000] },
            unresolved: [],
          },
        ],
      };
    },
  };
}

function eventReminder(text: string, title: string, unresolved: readonly string[]): SmokeScenario {
  return {
    text,
    expectation: { profiles: ['task'], workflowStatuses: ['applied', 'needsInput'] },
    draft: (request) => ({
      entryId: request.entry.id,
      items: [],
      components: [],
      workflows: [
        {
          kind: 'planningRequest',
          version: 1,
          reference: 'subject',
          profile: 'task',
          title,
          unresolved,
        },
        {
          kind: 'reminderRequest',
          version: 1,
          reference: 'reminder',
          subjectReference: 'subject',
          message: title,
          schedule: { kind: 'event', eventKey: 'emailReceived' },
          unresolved: [],
        },
      ],
    }),
  };
}

function knowledge(text: string, name: string, description: string): SmokeScenario {
  return {
    text,
    expectation: { profiles: ['knowledge'], workflowStatuses: [] },
    draft: (request) => ({
      entryId: request.entry.id,
      items: [{ reference: 'knowledge', referenceStatus: 'identified' }],
      components: [
        {
          reference: 'name',
          itemReference: 'knowledge',
          key: 'name',
          schemaVersion: 1,
          value: name,
          sourceLocators: [],
        },
        {
          reference: 'description',
          itemReference: 'knowledge',
          key: 'description',
          schemaVersion: 1,
          value: description,
          sourceLocators: [],
        },
      ],
      workflows: [],
    }),
  };
}

function quote(text: string): SmokeScenario {
  const exact = text.slice(1, -1);
  return {
    text,
    expectation: { profiles: ['knowledge'], workflowStatuses: [] },
    draft: (request) => ({
      entryId: request.entry.id,
      items: [{ reference: 'quote', referenceStatus: 'identified' }],
      components: [
        {
          reference: 'name',
          itemReference: 'quote',
          key: 'name',
          schemaVersion: 1,
          value: exact,
          sourceLocators: [],
        },
        {
          reference: 'quoteText',
          itemReference: 'quote',
          key: 'quote',
          schemaVersion: 1,
          value: exact,
          sourceLocators: [],
        },
      ],
      workflows: [],
    }),
  };
}

function entryText(request: InterpretationRequest): string {
  return request.entry.content.kind === 'text'
    ? request.entry.content.text
    : request.entry.content.url;
}
function endOfMonth(capturedAt: string): string {
  const captured = new Date(capturedAt);
  return new Date(
    Date.UTC(captured.getUTCFullYear(), captured.getUTCMonth() + 1, 1) - 1,
  ).toISOString();
}
