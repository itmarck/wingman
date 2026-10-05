# Wingman: core y API reference

Propuesta revisada el 5 de octubre de 2026; todavía sin implementar. Nombres internos/tablas en inglés y propiedades camelCase. No hay producción ni datos que proteger: la implementación puede sustituir el esquema inicial y resetear la base. Solo las migraciones requieren versionado.

## 1. Decisiones acordadas

- `Entry` captura texto para organizar y puede producir Tasks, Notes o Records. `Note` conserva conocimiento independiente, sin extraer acciones ni pertenecer obligatoriamente a una Collection. `Record` pertenece a una Collection y se edita mediante formulario.
- Selector Entry/Note en Minima; formulario contextual para Records. Una URL recibida es texto: no se descarga/analiza. Binarios y multimedia permanecen externos.
- JEV clasifica destino, área y referencias candidatas; conserva texto salvo presets concretos. No inventa valores de Records, concede permisos ni reemplaza datos mediante referencias ambiguas. Sin Review obligatorio.
- Una sola tabla links; Entity es identidad conceptual, no una tabla raíz obligatoria. Sin Items/Components, versiones internas ni historial universal.
- Un Processor paralelo al HTTP; módulos con funciones públicas. Sin clase/servicio por operación ni separación prematura en paquetes.
- Las vistas derivan estado de hechos/fechas cuando sea inequívoco. Se guardan hechos que no se pueden deducir.
- REST se limita al flujo previsto del launcher; consultas generales, diagnóstico e integraciones quedan internos.

### Áreas y clasificación

`area` es fija en código, única según el propósito principal:

| Valor | Significado |
| --- | --- |
| `employment` | Empleo. |
| `freelance` | Trabajo independiente para clientes. |
| `venture` | Iniciativas propias, individuales o con otras personas. |
| `wellbeing` | Salud y cuidado personal. |
| `maintenance` | Hogar, compras, finanzas y trámites. |
| `social` | Relaciones y participación comunitaria. |
| `entertainment` | Ocio. |

Clasificar por propósito, no palabras: sin áreas residuales personal/work, learning, community ni Organization. Aprendizaje adopta su finalidad. Records heredan area de Collection; Tasks de Project cuando exista. Tags, prioridad y duración pendientes.

## 2. API reference

**REST:** ✓ = exposición autenticada prevista ahora para el launcher. Vacío = operación interna, configuración futura o experimental; no implica eliminarla. No se define todavía una API administrativa.

**Modo:** Read consulta/calcula; Write guarda/cambia/solicita efectos. Las lecturas no completan tareas ni reconocen notifications. Las filas no requieren un endpoint, clase o archivo por operación.

| Área | Operación | Modo | REST | Entrada → resultado | Observaciones y consideraciones |
| --- | --- | --- | :---: | --- | --- |
| Capture | `content.capture` | Write | ✓ | text + inputMode Entry/Note → recibo con ID. | Origen autenticado y clave de envío; solo recepción durable, procesamiento posterior. |
| Content | `content.query` | Read | | ID/filtros → capturas, Notes o Records. | Sin explorador general en el launcher. |
| Content | `content.update` | Write | | ID y cambios concretos → actualización validada. | Cambios por ID; editar texto no reejecuta Tasks. Records usan saveRecord. |
| Content | `content.saveRecord` | Write | ✓ | Collection ID + Record ID opcional + propiedades/fields → Record. | Modal determinista; valores explícitos y referencias seleccionadas. |
| Entities | `entities.archive` | Write | | ID + archivar/restaurar → visibilidad. | Reversible; sin borrado ni cascada. |
| Catalog | `catalog.read` | Read | ✓ | Contexto → áreas, presets, plantillas/capacidades y preferencias necesarias. | Catálogo de código; crear Collection no amplía capacidades. Tags pendientes. |
| Collections | `collections.query` | Read | ✓ | ID/filtros → definición y Records. | Modal/selectores; Notes no son miembros. |
| Collections | `collections.save` | Write | ✓ | Nombre/area/definitions/fields + ID opcional → Collection. | fields puede estar vacío; definitions describe significado, sin schemaVersion. |
| Collections | `collections.removeField` | Write | | Collection/field ID y alcance → ocultar/eliminar campo. | Ocultar conserva datos; borrar definición/valores conjuntamente. |
| Links | `references.search` | Read | ✓ | Texto/contexto/Collection → candidatos con título/tipo/ID. | Solo título/tipo/ID; sin cuerpos completos ni sintaxis #id. |
| Links | `references.save` | Write | ✓ | fromId/toId + fieldId/context opcionales → Link. | Valida existencia, campo/cardinalidad y duplicados; sin ejecutar acciones. |
| Links | `references.query` | Read | ✓ | ID → vínculos y títulos de destinos. | Metadatos del objeto seleccionado, sin consulta general de contenido. |
| Links | `references.remove` | Write | ✓ | Enlace exacto → desvinculación. | No borra entidades; quitar reference modifica ese campo. |
| Work | `work.query` | Read | | ID/filtros → Tasks/Projects/Events. | Tipos disponibles según etapa; no endpoint general de Work. |
| Work | `work.save` | Write | | Tipo/ID/datos explícitos → Work validado. | Presets con datos validados; Projects posteriores y Events externos de lectura. |
| Work | `work.complete` | Write | ✓ | Task ID + completar/desmarcar → finishedAt. | Task seleccionada; actualizar avisos. Cancelación incompatible cuando exista. |
| Work | `work.day` | Read | ✓ | Fecha o rango de fechas + zona/filtros → tareas del período. | Filtra otras fechas; Calendar podrá complementar sin convertir Events en Tasks. |
| Work | `work.recur` | Write | | Tiempo/preset → próximas ocurrencias. | Solo presets habilitados; no infinitas filas anticipadas. |
| Journal | `journal.read` | Read | | Día/período → reflexiones, Records y hechos. | Vista basada en Notes y hechos; sin Collection obligatoria. |
| Search | `knowledge.search` | Read | | Texto/filtros → Notes/Records/Work y pasajes. | Texto primero, embeddings opcionales; sin generación. |
| Search | `knowledge.related` | Read | | Objeto/contexto → Links y similitud separados. | Similitud separada de Links; no prueba identidad/verdad. |
| Notification | `notification.query` | Read | ✓ | Contexto/cursor → avisos vigentes. | Pasivos; sin push ni aviso por cada captura exitosa. |
| Notification | `notification.respond` | Write | ✓ | ID + reconocer/aplazar → hechos. | Leer no reconoce; reconocer no completa Work. |
| Notification | `notification.refresh` | Write | | Cambios/tiempo → avisos agrupados. | Agrupa por asunto y retira motivos resueltos. |
| Processing | `processing.run` | Write | | Captura pendiente/Signal/tiempo → resultados. | Processor único; clasificación y presets, sin ejecución abierta. |
| Processing | `processing.query` | Read | | ID/trabajo → resultados, tiempos y errores. | Diagnóstico; inspector posterior, sin seguimiento del launcher. |
| Processing | `processing.retry` | Write | | Fallo identificado → reintento. | No repite efectos confirmados; fallo técnico distinto de unsupported. |
| Decisions | `decisions.classify` | Read | | Texto/contexto/opciones → clasificación. | Opciones cerradas y none/undetermined; niveles acotados. |
| Search | `decisions.embed` | Read | | Texto/pasajes → vectores. | Opcional; cache por texto/modelo, sin versiones de dominio. |
| Processing | `processing.index` | Write | | Texto cambiado → índice. | Fallo de índice no bloquea captura. |
| Connectors | `connectors.configure` | Write | | Proveedor/autorización/opciones → conexión. | Configuración fija y bootstrap de autorización; panel opcional. |
| Connectors | `connectors.describe` | Read | | Conexión → capacidades/estado. | Solo capacidades configuradas. |
| Connectors | `connectors.sync` | Write | | Conexión/cursor → Resources/Events/Signals. | Correos no son Entries; espejo externo no sustituye memoria personal. |
| Connectors | `connectors.request` | Write | | Capacidad/target/datos → solicitud. | Presets autorizados; mover correo, no enviarlo. Calendar sin escritura inicial. |
| Connectors | `connectors.apply` | Write | | Solicitud vigente → efecto/resultado incierto. | Verificar resultado incierto antes de repetir; sin transacción durante red. |
| Connectors | `connectors.copy` | Write | | Resource seleccionado → Note/referencia. | Copia explícita; sin inbox automático ni procesar binarios/URLs. |
| Windows | `windows.bind` | Write | | Control/acción → binding. | Experimental; definir bridge/dispositivo/flujo primero. |
| Windows | `windows.claim` | Write | | Bridge → solicitud reclamada. | claim cambia cola; offline no significa ejecutado. |
| Windows | `windows.report` | Write | | Solicitud/resultado → hecho. | Transporte/autenticación pendientes. |
| Settings | `settings.save` | Write | ✓ | Preferencias tipadas → zona, presets/límites. | Preferencias pequeñas; no áreas ni credenciales/conectores. |
| Exchange | `exchange.export` | Read | | Selección/formato → Markdown/JSON. | Puente futuro con IDs/definición actual; no backup integral. |
| Exchange | `exchange.import` | Write | | Archivo/target/cambios → contenido validado. | Validar cambios y concurrencia mediante base/timestamp; sin historial. |
| Changes | `changes.query` | Read | | Cursor → IDs cambiados. | Futuro; no dependencia del launcher. |
| Changes | `changes.stream` | Read | | Cursor → SSE autenticado. | Futuro; no compensa ausencia de Processing REST. |

**Flujo del launcher:** captura devuelve `{id, accepted: true}`; después refresca work.day y notification.query. El modal carga definición/Records con collections.query y guarda con content.saveRecord. No hay consulta general de Notes ni resultados de Processing en REST por ahora; no se promete devolver respuesta procesada al cliente. Las referencias solo exponen los metadatos necesarios para seleccionar/vincular.

La UI concreta de catálogos, formularios, referencias y preferencias se definirá al implementar su flujo.

## 3. Collections y Records

Collection define una lista estructurada; Record requiere collectionId. Note permanece independiente y se vincula mediante Links. Journal combina reflexiones y hechos, sin confundir un registro de actividad con asistencia a un Event.

**Solo collections y records para todas las listas**, sin tabla por tema. Campos completos en el modelo conceptual.

| Propiedad | Significado/regla |
| --- | --- |
| area | Solo en Collection; Record la obtiene de ella. |
| subtitle / body | Textos opcionales; no generar reseñas para rellenarlos. |
| category | Texto propio de la Collection, no tipo técnico global. |
| percentage | 0–100 o NULL; no significa automáticamente progreso. |
| createdAt / updatedAt | Gestionados por servidor. |
| occurredAt / dueAt | Ocurrencia/vencimiento; fecha y hora opcionales. No confundir con creación ni rellenar fecha actual si se desconoce. |
| url | Enlace principal externo, sin descarga/análisis. Otros enlaces en body o campo adicional; distinto de Link interno. |
| definitions | JSONB opcional: nombre de propiedad → significado textual. Orienta interpretación/formulario, no modifica tipos ni ejecuta reglas. |
| fields / values | Definiciones adicionales con UUID y datos JSONB; sin tabla por campo ni versiones internas. |

Ejemplo de definitions para películas: `{"subtitle":"Director","percentage":"Mi valoración sobre 100","occurredAt":"Fecha y hora de visionado","url":"Enlace a la ficha"}`. Con fields vacío, las propiedades compartidas bastan para muchas listas.

Tipos adicionales: text, number, boolean, date, select y reference; sin fórmulas/código. Renombrar conserva UUID; agregar campos opcionales no modifica registros previos. Tipo/cardinalidad y restricciones incompatibles se rechazan con datos. Ocultar conserva definición; borrar campo/valores es explícito y consistente. reference vive en links con fieldId, sin duplicarla en values.

Editar por IDs seleccionados; ausencia difiere de cero/false/vacío. Índices según consultas reales. Separar película y múltiples visionados en Collections enlazadas solo si hace falta.

## 4. Entidades, referencias y persistencia

### Un núcleo, dos capacidades

Knowledge conserva texto/datos; Work organiza acciones/compromisos. Son capacidades, no servicios ni jerarquías de clases. Sus tablas distinguen comportamientos; no crean mini-sistemas nuevos.

- **Task:** acción realizable; puede existir sola o pertenecer a un Project.
- **Project:** objetivo con identidad, título y área, que agrupa Tasks. Es Work, no Collection: una lista informativa puede ser Collection, pero no reemplaza el comportamiento de Project.
- **Event:** compromiso personal con horario fijo; no Task ni trabajo técnico. Se incorpora al integrar Calendar.
- **Job:** ejecución técnica pendiente que necesita persistencia propia. No es entidad personal ni aparece como Task. No crear jobs si el Processor puede recuperar el trabajo desde los datos existentes.

tasks.projectId expresa pertenencia; Links asocian Notes/Records/Collections/Events sin ese comportamiento. Tasks heredan área del Project o tienen la propia si son independientes. Completar Tasks no demuestra lograr el objetivo: definir cierre de Project después.

### Modelo conceptual y orden de incorporación

Campos orientativos, salvo propiedades acordadas de Collections/Records. Implementar solo los de la etapa activa.

| Tabla | Responsabilidad y campos principales | Incorporación |
| --- | --- | --- |
| `content` | Entry/Note: id, title, text, editedText?, inputMode, createdAt, updatedAt, archivedAt?, sourceId?, classifiedAt y clasificación. Sin collectionId/values. | Núcleo. |
| `collections` | id, name, area, definitions, fields. | Núcleo. |
| `records` | id, collectionId, title, subtitle, body, category, percentage, createdAt, updatedAt, occurredAt, dueAt, url, values. | Núcleo. |
| `tasks` | id, title, area, plannedFor, dueAt?, finishedAt?, sourceId?. Más adelante projectId?, availableFrom, startedAt, cancelledAt y waitingFor cuando exista su flujo. | Núcleo; inicialmente sin projectId. |
| `projects` | id, title, area, createdAt, updatedAt, finishedAt?. Agrupa Tasks mediante tasks.projectId → projects.id. | Posterior: agregar tabla y FK opcional juntas, sin convertir Collections. |
| `events` | id, title, startsAt/endsAt o startDate/endDate, timezone, cancelledAt?, connectionId/externalId. | Con Calendar. |
| `links` | fromId, toId, fieldId?, context?. Asociación común. | Núcleo para referencias necesarias. |
| `notifications` | subjectId, message, createdAt, acknowledgedAt?, deferredUntil?. | Núcleo. |
| `connections` | provider, config, cursor, nextSyncAt y credenciales protegidas. | Con conectores. |
| `resources` | id, connectionId, externalId, metadata. Identidad externa, sin tablas por proveedor. | Solo si los conectores necesitan conservarla. |
| `jobs` | kind, subjectId, availableAt, startedAt?, finishedAt?, error?. | Solo para trabajo que no pueda reconstruirse desde hechos existentes. |

UUID por objeto, sin tabla entities. Identidad externa incluye conexión/cuenta. Entry/Note conserva text original y editedText actual; Record edita body/values. Título elegido o primera línea; sin historial/generador.

### References: una asociación común

Link conecta objetos seleccionados por título/contexto; la UI muestra chips y conserva UUID. Renombrar no rompe vínculos.

`links(fromId, toId, fieldId?, context?)`: fieldId identifica una propiedad reference de Record; context es una explicación opcional. Sin catálogo cerrado de relaciones. Ejemplos: Note → Note, Task → Note, Project → Collection, Record de visionado → Record de película. La relación inversa se consulta sin duplicarla.

Persistencia valida existencia, campo/cardinalidad y duplicados entre tablas admitidas; no presume una FK universal. collectionId, projectId y sourceId son hechos estructurales, no Links duplicados. **Un Link no completa, bloquea ni ejecuta nada.** La similitud vectorial es una sugerencia aparte.

REST devuelve títulos/metadatos para seleccionar referencias; no abre un explorador general de Notes.

### Hechos antes que estados

Inbox deriva de classifiedAt ausente; realización de finishedAt; archivo de archivedAt; avisos de acknowledgedAt/deferredUntil. plannedFor organiza el día sin alterar dueAt. Al incorporar espera/cancelación/inicio, guardar waitingFor/cancelledAt/startedAt: no deducir hechos que no estén en los datos ni mantener otro estado equivalente.

Event es compromiso personal; Signal es entrada técnica al Processor, no otra tabla de Events.

## 5. Funcionamiento basado en JEV

Un **Processor** paralelo al HTTP recupera trabajo pendiente, limita concurrencia y evita duplicados. Sustituye separaciones entre worker, pipeline y scheduler.

JEV responde preguntas acotadas sobre capacidades disponibles: destino, área u opciones concretas; no genera por defecto ni interpreta capacidades inexistentes. Clasificación por niveles solo cuando aporta valor: decisiones independientes pueden agruparse, las dependientes usan el resultado anterior. [Primitivas](https://docs.typesafe.ai/primitives), [clasificación jerárquica](https://docs.typesafe.ai/cookbooks/hierarchical_classification).

- Entry normalmente conserva texto y recibe clasificación; crear Task/Note/Record solo mediante un preset concreto y validado.
- Note seleccionada explícitamente conserva su intención; admite organización y referencias, sin extracción exhaustiva.
- Record usa campos y valores deterministas del formulario. JEV puede ayudar a clasificar, no rellenar valores desconocidos.
- Sin evidencia suficiente se conserva la captura y lo seguro; un fallo técnico se reintenta, no se etiqueta como unsupported. Sin Review obligatorio.
- Instrucciones en inglés; entrada en español. Medir con ejemplos reales antes de añadir traducción, extracción especializada, embeddings o un LLM generativo. No asumir precisión garantizada. [Modelos](https://docs.typesafe.ai/models).

Presets son funciones de código, sin DSL: organize/taskCapture primero; journalCapture, mailTriage y calendarSync cuando exista su capacidad. Journal es una vista de Notes/reflexiones, Records y Work relacionados por fecha; no necesita tabla propia ni convertir todas sus Notes en Records.

GTD aporta inbox y próximas acciones; Zettelkasten Notes/Links; PARA objetivos, áreas, recursos y archivo; Kanban el flujo visible. Se combinan como comportamientos del mismo núcleo, no como subsistemas adicionales.

### Límites de ejecución e integraciones

Operaciones independientes entre clasificación, índices y red; transacciones cortas solo para cambios inseparables. Nunca mantener una transacción durante JEV o un conector. FKs concretas, unicidad e identidad de envío/efecto protegen consistencia y reintentos; dos textos iguales pueden ser capturas distintas. Ediciones pueden comparar updatedAt/valor actual, sin revision. [Transacciones](https://www.postgresql.org/docs/current/tutorial-transactions.html), [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

Conectores opcionales sin REST: configuración fija en Railway; autorización, renovación y cursor en adaptador/almacenamiento. Panel solo si hace falta.

| Conector | Capacidad prevista |
| --- | --- |
| outlook | Leer, clasificar, organizar/mover y avisar; sin enviar/responder/drafts. Mover requiere escritura. [Message move](https://learn.microsoft.com/en-us/graph/api/message-move?view=graph-rest-1.0). |
| googleCalendar | Leer/sincronizar compromisos fijos, zonas, all-day y ocurrencias. Sin tasklist, replanificación ni escritura inicial. |
| googleDrive | Archivos externos y referencias/metadatos; transferencias fuera del core textual. [Files](https://developers.google.com/workspace/drive/api/guides/about-files). |
| windows | Experimental; definir/probar bridge y acciones antes de exponer transporte o REST. |

Cambios externos llegan al Processor como Signals y producen Resources/Events/Notifications. Un correo no es Entry; copiarlo a Note es explícito. Fuente desaparecida no borra memoria personal; ante timeout de escritura se verifica el resultado antes de repetir.

## 6. Guía para iniciar la implementación

**API reference = catálogo futuro, no alcance inicial completo.** Implementar primero este flujo:

1. Capturar Entry/Note de forma durable y asíncrona, con respuesta de recepción.
2. Clasificar Entries con JEV y conservar el texto; implementar solo los presets necesarios para organizar y crear una Task sencilla con datos respaldados. Evitar extracción abierta.
3. Crear Collections/Records mediante formulario y referencias seleccionadas. Mantener las propiedades compartidas y áreas definidas aquí.
4. Mostrar Tasks por día/fecha, marcar/desmarcar realización y consultar/responder Notifications pasivas. La consulta es lectura, sin generar acciones al abrir la vista.
5. Verificar el flujo en contenedores, incluidos reinicio, reintento sin duplicación y una captura no soportada. Validar calidad semántica con ejemplos propios, además del comportamiento técnico.

Empezar con Tasks independientes. Posponer Projects, Events/conectores, recurrencia, embeddings, Windows, intercambio, streams e inspector; sin stubs de capacidades futuras.

Usar funciones/módulos pequeños para persistencia, decisiones e integraciones. Extraer límites por necesidad; sin clase por entidad, repositorio por tabla, interfaces sin consumidores ni paquetes prematuros.

Sustituir lo anterior sin compatibilidad/conversión de datos. Mantener PostgreSQL, contenedores locales y Railway con mismas dependencias/comportamiento. Versionar migraciones, no dominio; no conservar Items/Components/Reviews por herencia.

**Pendientes por etapa:** tags, prioridad/duración, UI, cierre de Projects, autorización y hardware. Sin anticipar arquitectura. JEV e integraciones aún no tienen benchmarks/pruebas propios.
