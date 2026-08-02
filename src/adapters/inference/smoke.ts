import type { PlanningProfile } from '../../core/planning/lifecycle.js';
import type { RegisterInterpretationInput } from '../../modules/interpretation/domain/input.js';
import type { InterpretationRequest } from '../../modules/interpretation/services/request.js';

export interface SmokeExpectation {
  readonly profiles: readonly (PlanningProfile | 'knowledge')[];
  readonly workflowStatuses: readonly ('applied' | 'needsInput' | 'unsupported')[];
  readonly unresolved: readonly string[];
  readonly reminders: number;
  readonly rules: number;
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

const smokeVariables = Object.freeze({
  bankName: 'Banco de Crédito del Perú',
  company: 'Acme',
  movieName: 'Arrival',
  name: 'Ana',
  projectName: 'Wingman',
  specialty: 'dermatología',
  system: 'Wingman',
});

/** Materializes the template variables in the Entry bank before API capture. */
export function materializeSmokeEntry(template: string): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = smokeVariables[key as keyof typeof smokeVariables];
    if (!value) throw new Error(`Missing smoke value for {${key}}`);
    return value;
  });
}

const definitions: readonly SmokeScenario[] = [
  reminderBeforeMonthEnd(
    'Recuérdame anular la tarjeta de crédito {bankName} antes de fin de mes',
    'Anular la tarjeta de crédito {bankName}',
  ),
  planning(
    'Tengo que llamar a {name} para agendar una cita',
    'task',
    'Llamar a {name} para agendar una cita',
  ),
  eventReminder(
    'Avísame cuando llegue un correo de {company} porque es urgente',
    'Atender correo urgente de {company}',
  ),
  planning(
    'Necesito que {system} sirva para documentarse a sí mismo también',
    'objective',
    'Hacer que {system} se documente a sí mismo',
  ),
  planning(
    'Todavía no he sacado consulta para {specialty}',
    'task',
    'Sacar consulta para {specialty}',
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
  ),
  planning('Ver {movieName}', 'task', 'Ver {movieName}'),
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
  ),
  planning('Amortizar hipoteca', 'task', 'Amortizar hipoteca'),
  quote('"Uno sufre más en la imaginación que en la realidad"'),
];

const scenarios = new Map(
  definitions.map((scenario) => [materializeSmokeEntry(scenario.text), scenario]),
);

function planning(
  text: string,
  profile: PlanningProfile,
  title: string,
  options: { readonly recurrence?: string; readonly unresolved?: readonly string[] } = {},
): SmokeScenario {
  return {
    text,
    expectation: {
      profiles: [profile],
      workflowStatuses: ['applied'],
      unresolved: [],
      reminders: 0,
      rules: 0,
    },
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
          title: materializeSmokeEntry(title),
          recurrence: options.recurrence,
          unresolved: [],
        },
      ],
    }),
  };
}

function reminderBeforeMonthEnd(text: string, title: string): SmokeScenario {
  return {
    text,
    expectation: {
      profiles: ['task'],
      workflowStatuses: ['applied', 'applied'],
      unresolved: [],
      reminders: 1,
      rules: 1,
    },
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
            title: materializeSmokeEntry(title),
            temporal: { to, precision: 'month' },
            unresolved: [],
          },
          {
            kind: 'reminderRequest',
            version: 1,
            reference: 'reminder',
            subjectReference: 'subject',
            message: materializeSmokeEntry(title),
            temporal: { to, precision: 'month' },
            schedule: { kind: 'deadlineOffsets', offsetsBeforeMs: [86_400_000] },
            unresolved: [],
          },
        ],
      };
    },
  };
}

function eventReminder(text: string, title: string): SmokeScenario {
  return {
    text,
    expectation: {
      profiles: ['task'],
      workflowStatuses: ['applied', 'unsupported'],
      unresolved: [],
      reminders: 0,
      rules: 0,
    },
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
          title: materializeSmokeEntry(title),
          unresolved: [],
        },
        {
          kind: 'reminderRequest',
          version: 1,
          reference: 'reminder',
          subjectReference: 'subject',
          message: materializeSmokeEntry(title),
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
    expectation: {
      profiles: ['knowledge'],
      workflowStatuses: [],
      unresolved: [],
      reminders: 0,
      rules: 0,
    },
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
    expectation: {
      profiles: ['knowledge'],
      workflowStatuses: [],
      unresolved: [],
      reminders: 0,
      rules: 0,
    },
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
