import {
  define,
  noExecutableEffects,
  profiles,
  reminders,
  reviews,
  status,
  workflows,
} from '../runner.js';

define('creates a task for an explicit personal action', () => ({
  entry: 'Tengo que llamar a Ana para agendar una cita.',
  expect: [status('completed'), reviews(0), profiles('task'), workflows('applied')],
}));

define('creates a habit for an explicit daily practice', () => ({
  entry: 'Conversar en inglés unos 15 minutos al día para no perder práctica.',
  expect: [status('completed'), reviews(0), profiles('habit'), workflows('applied')],
}));

define('creates a deadline reminder with a separate planning subject', () => ({
  entry: 'Recuérdame anular la tarjeta de crédito del Banco Andino antes de fin de mes.',
  expect: [
    status('completed'),
    reviews(0),
    profiles('task'),
    workflows('applied', 'applied'),
    reminders(1),
    noExecutableEffects(),
  ],
}));

define('keeps an unavailable email event source unsupported', () => ({
  entry: 'Avísame cuando llegue un correo de Acme porque es urgente.',
  expect: [
    status('completed'),
    reviews(0),
    profiles('task'),
    workflows('applied', 'unsupported'),
    reminders(0),
    noExecutableEffects(),
  ],
}));

define('plans destructive text without executing it', () => ({
  entry: 'Eliminar la carpeta overrides del proyecto Wingman.',
  expect: [
    status('completed'),
    reviews(0),
    profiles('task'),
    workflows('applied'),
    noExecutableEffects(),
  ],
}));
