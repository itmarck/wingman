# Migración al núcleo de Wingman

Plan preparado el 5 de octubre de 2026 antes de modificar la implementación.
La especificación vigente es REFERENCE.md; reemplaza las convenciones del modelo anterior.

## Alcance y decisiones

1. Sustituir el esquema inicial por content, collections, records, tasks, links,
   notifications, settings y telemetry. Sin conversión, compatibilidad ni reset de la
   base del usuario durante este trabajo. Bases anteriores requieren recreación explícita.
2. Sustituir core/modules/system y los paquetes de interpretación/evaluación por
   módulos pequeños de funciones: model, storage, content, work, decisions,
   processing, http, auth y runtime. Separar solamente responsabilidades reales;
   no repositorios por tabla, servicios por operación ni infraestructura de plugins.
3. Captura durable con source del token y submissionKey única por source. Un reenvío
   idéntico devuelve el mismo ID; reutilizar la clave con otro contenido es conflicto.
   Entry/Note preserva texto original. Edición interna no vuelve a crear efectos.
4. Un Processor con concurrencia inicial de uno recupera capturas sin classifiedAt.
   Reclamo con vencimiento y token; inferencia fuera de transacción; publicación
   atómica y deduplicada por sourceId. Persistir error, intento, siguiente reintento
   y telemetría. Un fallo técnico nunca se convierte en unsupported.
5. JEV mediante HTTP y opciones cerradas, sin SDK nuevo ni fallback generativo.
   organize clasifica sin generar texto; taskCapture crea como máximo una Task,
   conservando el texto, solo ante una acción simple y área determinada. Fechas
   explícitas proporcionadas por el cliente; no adivinar fechas de texto libre.
   Notes explícitas nunca extraen Tasks. Unsupported conserva captura y avisa.
6. Collections/Records con propiedades compartidas y campos text/number/boolean/
   date/select/reference. References exclusivamente en links. Validar cambios de
   campos contra datos existentes, cardinalidad, destinos y duplicados. Ocultar
   conserva; eliminar campo quita valores y links en la misma transacción.
7. Tasks independientes por fecha; completar/desmarcar. Notifications persistentes
   agrupadas por asunto, reconocimiento/aplazamiento explícitos. GET sin efectos.
   Catálogo y settings tipados, archivo reversible interno y referencias por UUID.
8. REST solo para el launcher y rutas operacionales existentes; autenticación JWT
   y token público exclusivamente en development. Sin REST general de contenido,
   procesamiento o Work. Documentar rutas exactas y cuerpos de ejemplo.
9. Eliminar código, pruebas, esquemas y documentación del modelo sustituido.
   Conservar dependencias instaladas necesarias, PostgreSQL, Podman y Railway.
   No modificar temp, secretos, datos locales, remotos ni Git; no commits.

## Verificación y aceptación

- Typecheck, Biome, build y pruebas unitarias del adaptador/validación.
- PostgreSQL real aislado en contenedor, con imágenes y dependencias locales.
- Flujo HTTP autenticado: capture → Processor → day → complete → notifications;
  Collections/Records/Links, campos incompatibles, falsy values y conflictos.
- Dos Processors, reinicio, reclamación vencida, reintento y recepción duplicada:
  una sola Task y ninguna transacción retenida durante inferencia.
- Ejemplos españoles: acción simple, Note explícita, texto ambiguo, negación y
  solicitud no soportada. Dobles deterministas verifican política y transporte;
  no se presentarán como medición de precisión real de JEV.
- Sin llamadas de inferencia reales, instalación de dependencias, despliegues ni
  modificaciones de red. Documentación pública consultada solo en lectura para
  verificar el contrato del proveedor. Si faltan credenciales, dejar explícito el
  benchmark semántico pendiente; no simular un resultado del proveedor.

## Fuera de alcance

Projects, Events, conectores, recurrencia, embeddings, búsquedas generales,
Windows, import/export, streams, inspector, UI, tags, prioridad y duración.
No crear tablas, rutas ni stubs para esas etapas.

## Resultado de la implementación

Núcleo sustituido por diez módulos de producción y una migración inicial. Se
retiraron las capas, paquetes, pruebas y documentos del modelo anterior; REFERENCE.md
se conserva intacto. AGENTS.md y README.md describen el sistema nuevo. No se añadieron
dependencias: se retiraron uuid y el proveedor de tipos de Fastify sin consumidores,
y el lockfile se actualizó en modo offline. TypeScript tiene noImplicitAny activado.

Decisión concreta al implementar: taskCapture requiere plannedFor explícito, además
de estar habilitado en settings, para no generar una Task invisible en la vista
diaria. No hay extracción de fechas del texto. Los fallos técnicos repetidos avisan
una vez por captura desde el tercer intento y el aviso se retira al recuperarse.

Verificación completada el 5 de octubre de 2026:

- Biome sin advertencias, typecheck y build correctos.
- En el corte inicial del 5 de octubre: 16 pruebas (4 unitarias, 10 de PostgreSQL y
  2 HTTP). Ese conjunto se retiró al simplificar el árbol. El estado actual se
  describe más abajo; esta cifra es solo evidencia histórica.
- Contenedores con imágenes existentes, sin red externa ni puertos publicados.
  Pruebas y arranque se ejecutaron montando código/dependencias locales; no se
  reconstruyó la imagen Dockerfile ni se descargaron paquetes/imágenes.
- npm start aplicó 001_core sobre una base aislada; el segundo arranque detectó
  correctamente que no había migraciones pendientes. Health/readiness/OpenAPI y
  catálogo autenticado devolvieron 200; token público en producción devolvió 404.
- El proceso Node directo terminó con código 0 ante SIGTERM. El wrapper npm
  informa SIGTERM y salida 1 cuando Podman detiene npm start; no fue un error de
  la aplicación. El cierre del Processor en inferencia también tiene prueba.
- Recuperación desde otra conexión, dos Processors concurrentes y reclamación
  vencida verificadas; una Task por captura. Datos del usuario no modificados.

Pendiente deliberado: benchmark real de JEV en español, con sus credenciales y
llamadas al proveedor. El contrato HTTP se comprobó en documentación oficial y con
respuestas simuladas, no con inferencia real. taskCapture queda deshabilitado de
inicio. Umbral de confianza provisional: 0.8. No se afirma precisión semántica.

No se realizaron commits, push, despliegues ni cambios de configuración de red.

## Ajuste de desarrollo posterior

Se decidió mantener Node.js/npm en el host para ejecutar las pruebas, el typecheck
y el build. `npm test` corre Vitest directamente; PostgreSQL y la aplicación siguen
en Compose. El servicio `tests` se eliminó porque las pruebas actuales son unitarias
y deterministas; no arrancan PostgreSQL ni requieren la red de Compose. El README
indica los requisitos de desarrollo (Node >=22.18 y `npm ci`). AGENTS.md deja las
pruebas de integración de base de datos y HTTP fuera del alcance actual.

## Configuración del modelo

El modelo JEV es una constante en `src/platform/runtime.ts`, junto a la inicialización del
Processor. La clave de API permanece como secreto de entorno (`TYPESAFE_API_KEY`).
`.env.example` y README.md reflejan esta separación. Railway ya no requiere `JEV_MODEL`.
