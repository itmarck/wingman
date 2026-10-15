# Wingman: definición del sistema

Documento de trabajo para definir los conceptos base antes de seguir implementando. Cada tema tiene un estado:

- **Abierto**: en debate, sin propuesta clara.
- **Propuesto**: hay una propuesta, falta validarla.
- **Aceptado**: la dirección está confirmada, pero los detalles pueden variar en el futuro o cambiar por decisiones de otros temas.
- **Decidido**: conclusión acordada, escrita en «Conclusión».

REFERENCE.md y MIGRATION.md quedan como backlog de ideas, no como guía actual. El código existente es solo una base y puede cambiar por completo, porque no hay datos reales. Al cerrar los temas, se revisa el documento completo para comprobar que todo encaja.

---

## 1. Objetivo y principios

**Estado:** Aceptado

Wingman es una bitácora personal con base de datos propia. Guarda tareas, notas puntuales (diario) y colecciones de datos (películas, lugares, recetas, preferencias). No guarda archivos: fotos y documentos viven en Google y aquí solo se guarda su URL. Corre en Railway con PostgreSQL. El cliente principal es un launcher Android en Flutter, y lo acompaña un panel administrativo web simple.

Principios:

1. **Simple para un solo mantenedor.** Cada concepto debe justificar su costo.
2. **Mío, no genérico.** El sistema decide como yo decidiría: catálogos y criterios pensados para mi uso, pero escritos de forma general.
3. **Clasificar en lugar de generar.** JEV toma las decisiones; herramientas deterministas o modelos locales resuelven tareas puntuales de lenguaje. No hay LLM generativo.
4. **Mis datos son míos.** El texto original se conserva tal cual, se puede exportar y se respalda.

**Conclusión:** objetivo y principios aceptados. Se revisan si una decisión de otro tema los afecta o si falta aclarar algún objetivo.

---

## 2. Bases técnicas

**Estado:** Decidido

- **Guardar hechos, no estados.** Se guarda «cuándo se terminó» (`finishedAt`) en lugar de `status = done`. El estado se deduce de esa fecha, así que no hay dos datos que puedan contradecirse.
- **Texto original intacto.** Lo que escribes no se reescribe; las ediciones van aparte.
- **No hay envíos duplicados.** El launcher manda una `submissionKey` por captura. Si reintenta por falta de red, el servidor reconoce el envío y no lo duplica. Esto permite que el launcher funcione offline.
- **Ninguna llamada externa dentro de una transacción.** Primero se guarda, luego se clasifica fuera de la base y al final se publica el resultado de golpe.
- **Un solo proceso de fondo (Processor)** junto al servidor HTTP, sin colas ni workers aparte.
- **JEV solo elige entre opciones cerradas.** Nunca inventa valores.
- **Archivos fuera del sistema:** solo se guardan URLs.
- **Identificadores:** todas las tablas de contenido usan UUID v7, generado por Postgres con `DEFAULT uuidv7()`. Son únicos en todo el sistema, lo que permite que `links` apunte a cualquier tabla (tema 10), y como empiezan con la fecha de creación, salen ordenados en el tiempo. Los registros técnicos que nadie referencia, como la telemetría, pueden usar un `bigint` autoincremental.
- **Idioma:** los nombres del sistema van en inglés siempre que se pueda: código, tablas, Collections con sus `definitions` y campos, y descripciones o comentarios internos. Lo que el usuario escribe en las Entries se guarda en el idioma en que lo escribió, normalmente español.

**Conclusión:** se mantienen tal cual.

---

## 3. Primitivos: Entries y Collections

**Estado:** Decidido

El sistema tiene dos conceptos base, cada uno con su propia tabla:

- **Entries:** la bitácora. Son elementos con comportamiento: se clasifican, aparecen en vistas, se completan y generan avisos.
- **Collections:** almacenamiento. Son listas de cosas sin comportamiento propio. Cada Collection tiene **Records**.

```text
entries      (id, kind, title, text, area, parentId?, occurredAt?, plannedFor?, dueAt?, finishedAt?, archivedAt?, ...)
collections  (id, name, area, definitions, fields, archivedAt?, ...)
records      (id, collectionId → collections.id, title, ...columnas generales, values?, ...)
```

### Entries y sus kinds

Todo lo que se registra en la bitácora es una Entry de algún tipo (`kind`). El tipo lo decide el usuario al registrar y es definitivo: JEV no lo cambia.

| Kind | Qué es | Quién lo crea |
| --- | --- | --- |
| `note` | Texto libre: idea, reflexión, dato puntual. | Launcher. |
| `task` | Acción por hacer. | Launcher. |
| `project` | Objetivo importante que agrupa Entries (tema 20). | Panel. |

- Un kind no está limitado al texto: puede requerir otros datos para registrarse, como fechas o valores.
- `entries` tiene columnas de hechos que solo se llenan cuando aplican (tema 9). Reglas `CHECK` por kind evitan combinaciones sin sentido; por ejemplo, solo `task` y `project` pueden tener `finishedAt`.
- Agregar un kind = un valor nuevo de `kind`, más columnas solo si trae hechos nuevos. Si trae muchos datos propios, recién entonces se le crea una tabla de extensión.

### Collections y Records

- Una Collection define su nombre, su área opcional y `definitions`: un texto por columna general que explica qué significa en esa Collection. Por ejemplo, en `Movies` `subtitle` significa «Director». Es solo referencial: da contexto al sistema y **no cambia la API**, que siempre devuelve las mismas propiedades para todos los Records.
- Un Record pertenece a una Collection (`collectionId`, con llave foránea real) y usa las columnas generales (tema 9).
- En la primera versión, las Collections y sus Records se crean desde el panel administrativo. Más adelante, el launcher podrá mostrarlos y crear Records.

### Criterio para un kind nuevo vs. una Collection

Un kind nuevo solo se justifica si necesita **comportamiento**: estados, vistas propias, avisos o integración. Si solo guarda datos, es una Collection.

| Candidato | ¿Kind o Collection? |
| --- | --- |
| Movies, series, anime, places, phrases, recipes, games | Collection |
| Personas, hábitos | Collection, si hace falta |
| Project | Kind (tema 20) |
| Event | Kind (con Calendar, futuro) |
| Acción de hardware (macropad) | Kind o mecanismo aparte (futuro) |

**Conclusión:** Entries (bitácora con comportamiento) y Collections con sus Records (solo almacenamiento) son conceptos y tablas separados.

---

## 4. Diario (Journal)

**Estado:** Decidido

El diario no es una tabla: es una **vista calculada** de Entries y Records por fecha. Hay muchas notas sueltas, días sin nada y días con muchas.

- Usa `occurredAt`, es decir, cuándo pasó algo; si no se indica, se toma `createdAt`.
- Mezcla tipos: notas del día, tareas completadas ese día y Records con `occurredAt` ese día (por ejemplo, «vi tal película»).
- La misma fuente sirve para otras vistas: por semana, por área, «hace un año» o reportes.

**Conclusión:** el diario es una vista calculada por fecha, sin tabla propia.

---

## 5. Áreas

**Estado:** Decidido

Son **fijas en código**, pensadas para mi uso pero escritas de forma general. Sirven sobre todo para **filtrar y hacer reportes**. Cada área abarca algo claro sin superponerse con otra.

| Área | Significado |
| --- | --- |
| `employment` | Empleo. |
| `freelance` | Trabajo independiente para clientes. |
| `venture` | Iniciativas propias. |
| `wellbeing` | Salud y cuidado personal. |
| `maintenance` | Hogar, compras, finanzas y trámites. |
| `social` | Relaciones, familia y comunidad. |
| `entertainment` | Ocio. |

- Cada Entry tiene una sola área, la de su propósito principal. JEV siempre elige una; la confianza se guarda para diagnóstico y el área se puede corregir.
- Las Collections tienen área opcional: una Collection transversal (por ejemplo, `Bookmarks`) no tiene área. Los Records no guardan área: usan la de su Collection.
- Las descripciones (`criteria`) que recibe JEV se escriben con cuidado y con ejemplos propios (tema 6).

**Conclusión:** siete áreas fijas en código, sin superposición entre ellas.

---

## 6. Clasificación personalizable

**Estado:** Decidido

JEV no aprende ni tiene memoria: solo se personaliza con lo que se le envía en cada llamada (`state`, `instructions` y `criteria`). Por eso toda la personalización vive en Wingman.

### Preguntas puntuales por Entry

Un **catálogo de preguntas en código** es la base. A cada Entry se le hacen varias preguntas puntuales sobre cosas del sistema o cosas que el sistema puede hacer (tema 7), todas en una sola llamada. Cada respuesta se guarda como un atributo de la Entry, y juntas la definen con precisión. Después, las vistas filtran con esos atributos de forma determinista (tema 8).

- Cada pregunta define a qué kinds aplica, sus instrucciones, sus opciones (fijas o tomadas de datos, por ejemplo los proyectos abiertos) y su umbral de confianza.
- Si la respuesta supera el umbral, se aplica; si no, el atributo queda vacío (`NULL`). La excepción es el área, que siempre se asigna.
- Cada atributo guarda **por qué** se asignó (preferencias enviadas, respuesta de JEV y probabilidades), y eso se puede ver en el panel.

### Preferencias en lenguaje natural

Son la única forma de personalizar las decisiones: textos cortos como «AWS courses belong to employment» o «Todo lo de la tienda X es del proyecto Y».

- Se guardan en la base y se editan solo desde el panel.
- Se separan por kind: a JEV solo se envían las del kind de la Entry que se clasifica, en `state` y separadas del texto capturado.
- El texto de una Entry nunca se convierte en preferencia.

### Backlog

- **Reglas deterministas:** condiciones estructuradas aplicadas antes de JEV, con resultado garantizado y sin costo. Se descartan por ahora porque se superponen con las preferencias. Volverían solo si una preferencia en lenguaje natural no resulta lo bastante confiable para un caso concreto.
- **Correcciones como evidencia:** guardar correcciones para medir el acierto o proponer preferencias. Se evaluará si el beneficio justifica la complejidad.

**Conclusión:** catálogo de preguntas en código más preferencias en lenguaje natural por kind, editadas desde el panel.

---

## 7. Qué decide JEV

**Estado:** Aceptado

| Primitiva | Responde |
| --- | --- |
| Choice | ¿Cuál de estas opciones? |
| Score | ¿Qué nivel en una escala ordenada? |
| Noul | ¿Es verdad esto? (0–1) |

Todas las preguntas de una llamada se evalúan en paralelo. El costo (unos $0.042 por millón de tokens de entrada; la salida es gratis) es de pocos dólares al año, así que el dinero no es la restricción. La restricción es que **cada pregunta debe cambiar algo** (una vista, un filtro, un orden o un aviso).

Candidatas, en una lista todavía abierta que puede cambiar al definir otros temas:

| Pregunta | Primitiva | Aplica a | Uso |
| --- | --- | --- | --- |
| Área | Choice | Entries | Filtros y reportes. |
| Proyecto | Choice entre proyectos abiertos, o ninguno (`NULL`) | Entries | Agrupar por proyecto (tema 20). |
| ¿Ya está hecha / es pasada? | Noul | `task` | Evita tareas que solo eran un registro. |
| Contexto (casa, PC, fuera, teléfono) | Choice | `task` | Filtra la lista «ahora». |
| Esfuerzo | Score | `task` | Muestra tareas cortas si hay poco tiempo. |
| Importancia | Score | `task` | Ordena la lista «ahora». |
| Ánimo / energía | Score | `note` | Reportes del diario. |
| ¿Es igual a esta otra tarea? | Noul | `task` | Detecta duplicados. |
| Relevancia para una búsqueda | Score | Resultados | Reordena la búsqueda. |

- Las preguntas dependientes de otra respuesta van en una segunda llamada.
- Pendiente: medir el acierto de JEV en español con ejemplos reales antes de fijar umbrales.

**Conclusión:** JEV responde un catálogo de preguntas puntuales por Entry. El área y el proyecto están confirmados; el resto de la lista sigue abierta.

---

## 8. Tareas: mostrar pocas y las correctas

**Estado:** Aceptado

El launcher no muestra todas las tareas pendientes, sino unas pocas elegidas según el momento.

- **JEV y los demás modelos trabajan al capturar:** clasifican todo lo que pueden con la mayor cantidad de datos posible (tema 7).
- **Las vistas son deterministas:** al abrir el launcher no se llama a JEV. Una función en código calcula la lista a partir de los atributos guardados. Es instantánea, gratis y explicable.
- **Factores del puntaje** (pesos ajustables en código):

  | Factor | Efecto |
  | --- | --- |
  | Vencimiento (`dueAt`) cercano o vencido | Sube fuerte. |
  | Planificada para hoy (`plannedFor`) | Sube. |
  | Área acorde al momento | Por ejemplo, `employment` en horario laboral entre semana. |
  | Contexto | Lo que el launcher sabe del momento. |
  | Esfuerzo | Frente al tiempo disponible. |
  | Antigüedad | Sube poco a poco, para que nada se olvide. |
  | Veces pospuesta | Si la saltas muchas veces, baja. |

- Las interacciones («pospuesta», «saltada») se guardan como hechos.
- La vista completa de pendientes existe, pero no es la principal.
- Por definir: qué contexto conoce el launcher y cuántas tareas muestra a la vez.

**Conclusión:** captura inteligente y vistas deterministas. Los factores son la dirección aceptada; sus detalles se ajustarán.

---

## 9. Modelo de datos: columnas generales y JSONB

**Estado:** Decidido

- **Columnas para todo lo posible, de la forma más general posible.** Las columnas de hechos se llenan solo cuando aplican; las demás quedan vacías porque conceptualmente no ocurrieron.
- **Columnas generales de Records:** `title`, `subtitle`, `body`, `category`, `rating`, `amount`, `url`, `occurredAt`, `dueAt`, `archivedAt`, `createdAt` y `updatedAt`. La API siempre devuelve estas propiedades; cada Collection solo describe en `definitions` qué significan para ella. Por ejemplo, en `Movies`: `subtitle` = "Director", `category` = "Genre", `rating` = "My rating", `occurredAt` = "Watched on".
- **JSONB (`values`) solo para datos sin comportamiento:** valores extra que una Collection necesita guardar, pero sobre los que el sistema no hace nada, o solo algo muy simple como mostrarlos. Su definición vive en `fields` de la Collection, con tipos simples: text, number, boolean, date, select y url.
- A escala personal, el rendimiento no es un factor; se comprobó el 11/10/2026.

**Conclusión:** columnas generales para todo lo que tenga significado o comportamiento; JSONB solo para datos extra sin comportamiento.

---

## 10. Referencias (links)

**Estado:** Decidido

Una sola tabla relaciona cualquier elemento con cualquier otro (Entries, Collections y Records):

```text
links (fromId, toId, fieldId?, note?, createdAt)
```

- Todos los ids son UUID únicos en todo el sistema, así que un link puede apuntar a cualquier tabla, presente o futura, sin llaves foráneas.
- La existencia de ambos extremos se valida en código al crear el link.
- No hay borrado físico, solo archivo (`archivedAt`), así que no quedan links huérfanos.
- La relación inversa se consulta sin duplicarla.
- Un link no ejecuta nada: es solo asociación.
- Las relaciones **estructurales** (Record → Collection con `collectionId`, Entry → Entry padre con `parentId`) van como columna con llave foránea real, no como link.
- `fieldId` indica qué campo representa un link entre Records, por ejemplo un visionado que apunta a una película. No hay etiquetas de relación por ahora.
- Los links se crean manualmente: con `@` en el launcher se busca por título y se elige.

**Conclusión:** una sola tabla `links` con UUIDs, sin llaves foráneas y validada en código.

---

## 11. Captura desde el launcher

**Estado:** Decidido

- El launcher **elige el kind** al capturar: nota o tarea en la primera versión. El kind es definitivo; JEV solo agrega atributos (área, proyecto y otros).
- La respuesta es inmediata (recibo con id). La clasificación ocurre en segundo plano.
- Funciona offline: el launcher guarda en una cola local y reenvía con la misma `submissionKey`.
- **Compartir desde Android:** desde cualquier app (Drive, Photos, YouTube, un artículo), «Compartir → Wingman» crea una Entry con la URL.
- Cada kind define su propio formulario de captura y puede requerir datos además del texto.

**Conclusión:** el kind lo elijo yo; JEV solo agrega atributos.

---

## 12. API

**Estado:** Decidido

La API es el puente entre el launcher y el sistema: solo expone endpoints útiles para el launcher y se orienta a recursos. Este esbozo es el punto de partida y evolucionará con el uso:

```text
GET/POST  /api/entries                     captura y listado por filtros
GET/PATCH /api/entries/{id}                detalle y edición
GET       /api/tasks?view=now              lista corta priorizada
POST      /api/tasks/{id}/finish | /reopen
GET/POST/DELETE /api/entries/{id}/links
GET       /api/journal?from&to
GET       /api/search?q=
GET       /api/notifications               avisos vigentes (tema 13)
GET       /api/collections                 (más adelante)
GET/POST  /api/collections/{id}/records    (más adelante)
```

El panel administrativo (tema 18) usa sus propias rutas internas.

**Conclusión:** API orientada a recursos, solo para el launcher, con este esbozo como punto de partida.

---

## 13. Funcionalidades priorizadas

**Estado:** Aceptado

| Funcionalidad | Decisión |
| --- | --- |
| **Búsqueda** | Simple pero completa: encuentra cualquier Entry, Collection o Record a partir de texto. Usa la búsqueda de texto de Postgres en español, que ignora acentos y tolera errores de tipeo. |
| **Notificaciones** | No invasivas. `GET /api/notifications` devuelve los avisos vigentes y el launcher decide cómo listarlos. Sin push, sonido ni vibración. |
| **Recordatorios derivados** | Avisos inteligentes generados a partir de los datos (vencimientos cercanos, tareas olvidadas), que aparecen en `/api/notifications`. |
| **Projects** | Importante para ordenar (tema 20). |
| **Backup** | Por ahora, un comando simple en el README para generar el respaldo desde Railway, por ejemplo `pg_dump "$DATABASE_PUBLIC_URL" -Fc -f wingman.dump`. |
| **Recurrencia** | No por ahora. |
| **Calendar** | Prioridad baja; se revisa cuando el sistema esté más sólido. |

**Conclusión:** búsqueda, notificaciones pasivas, recordatorios derivados, Projects y backup por comando entran; recurrencia y Calendar esperan.

---

## 14. Herramientas deterministas y modelos locales

**Estado:** Aceptado

Se usan solo si aportan y son confiables.

- **Ahora:** probar `chrono-node` para detectar fechas en español («mañana a las 3», «el viernes») en el servidor y llenar `dueAt` o `plannedFor`.
- **En espera:** ML Kit en el teléfono (extracción de entidades, traducción) y embeddings para búsqueda semántica con `pgvector`.

**Conclusión:** solo `chrono-node` por ahora; el resto queda en espera.

---

## 15. Collections iniciales e ideas

**Estado:** Aceptado

Los nombres de las Collections, sus `definitions` y sus campos van en inglés (tema 2).

| Collection | Contenido |
| --- | --- |
| `Movies` | Películas. |
| `Series` | Series. |
| `Anime` | Anime. |
| `Places` | Sitios visitados o por visitar, restaurantes. |
| `Phrases` | Citas y frases. |
| `Recipes` | Recetas. |
| `Games` | Juegos. |

### Collections del sistema

Una Collection también puede guardar configuración, así el sistema se usa a sí mismo sin tablas extra:

- **`Settings`:** cada Record es un ajuste; `title` es la clave y `body` el valor (por ejemplo, `timezone` = `America/Lima`).
- El código define qué claves existen, su valor por defecto y cómo se valida cada valor. Si una clave no existe o su valor es inválido, se usa el valor por defecto.
- Los Records no tienen comportamiento propio: el sistema solo lee sus valores. Así se respeta la idea de que las Collections son almacenamiento.
- Se identifican por un id fijo creado en la migración, no por su nombre, y no se pueden archivar.

### Lluvia de ideas para después

Libros, cursos, música, podcasts, personas, preferencias personales (comida, marcas, tallas), ideas de regalo, lista de deseos, cosas que tengo (con garantía), suscripciones, compras, hábitos y métricas (sueño, ejercicio), salud (medicinas, citas médicas), mantenimiento del vehículo, viajes, «para leer/ver después», logros, decisiones importantes, preguntas por investigar y sueños.

No se guardan contraseñas, documentos de identidad ni datos sensibles.

**Conclusión:** siete Collections iniciales, separadas por tema porque cada una necesita sus propias `definitions`, más `Settings` como Collection del sistema; las demás quedan como ideas.

---

## 16. Integraciones futuras

**Estado:** Abierto

Se piensan cuando el sistema esté más sólido.

- **Macropad en Windows:** la de mayor interés. Encaja como otra fuente de captura (`source = macropad`). Falta definir el puente y el flujo.
- **Google Calendar:** solo lectura.
- **Outlook:** leer y clasificar correos, sin enviar.
- **Google Drive/Photos:** solo URLs, al compartir desde Android.
- **Google Contactos:** descartado por ahora.

**Conclusión:** —

---

## 17. Factibilidad y escalado

**Estado:** Decidido

- **Costo:** Railway con Postgres cuesta pocos dólares al mes; JEV, pocos dólares al año.
- **Volumen:** un uso personal intenso genera decenas de miles de filas en años, y Postgres no lo nota.
- **Evolución:** agregar kinds, preguntas o preferencias no exige rediseño.
- **Riesgo real:** el alcance, no la técnica. Cada funcionalidad nueva debe responder qué vista o comportamiento cambia.

**Conclusión:** el sistema es factible y escala para su uso personal.

---

## 18. Panel administrativo

**Estado:** Decidido

Forma parte de la primera versión y tiene dos funciones:

1. **Flujo del procesamiento:** cada captura, las preguntas enviadas a JEV con sus respuestas y probabilidades, los atributos asignados y su motivo, los errores y los reintentos. Se actualiza con refresco periódico.
2. **Gestión de recursos:** Collections con sus definiciones y campos, Records (incluidos los `Settings`), Projects y preferencias de clasificación.

Decisiones técnicas:

- **Servidor:** archivos estáticos servidos por el mismo servidor Fastify, con los datos del mismo servidor.
- **Build:** una app React pequeña compilada con Vite dentro del `npm run build` existente. Radix UI requiere React, y compilar permite usar TypeScript con el mismo typecheck del proyecto, sin depender de CDNs al ejecutar.
- **Autenticación:** el mismo token de la API, sin login propio.
- **UI:** estilo similar a shadcn en tema oscuro, sin usar shadcn. Componentes primitivos de Radix UI e iconos de Radix Icons, con estilos propios en CSS normal. Un archivo `theme.css` define las variables (custom properties) que usa todo el panel.

**Conclusión:** panel simple en la primera versión, en el mismo servidor y con el token de la API.

---

## 19. Revisión final de coherencia

**Estado:** Pendiente

Se hace al cerrar los temas anteriores. Hay que comprobar que kinds, Collections, links, clasificación, vistas, API y panel forman un sistema coherente y lo más simple posible.

---

## 20. Projects y jerarquía de Entries

**Estado:** Decidido

### Relación padre (`parentId`)

Las Entries tienen una relación genérica consigo mismas: `parentId`, opcional, con llave foránea hacia `entries`. Indica a qué Entry pertenece otra. Projects son un uso de esta relación, no un campo propio.

- Una Entry tiene como máximo un padre; sin padre, `parentId` es `NULL`. No existe un valor literal como «none».
- Es una relación **estructural** (pertenencia, una sola). Las asociaciones libres siguen en `links` (tema 10).
- El código define qué kinds pueden ser padre de cuáles. En la primera versión solo un `project` puede ser padre, de cualquier Entry que no sea otro proyecto. Más adelante se podrían permitir subtareas (`task` → `task`) sin cambiar el modelo.
- El código impide ciclos y que una Entry sea su propio padre.

### Projects

- **Kind `project` de Entry**, no Collection, porque tiene comportamiento: agrupa Entries y tiene cierre. Solo se usa para objetivos importantes: «pintar la casa», por ejemplo, no es un proyecto.
- Se crean **solo desde el panel**, para simplificar el launcher.
- Un proyecto puede durar años abierto. Se cierra con `finishedAt`.
- Solo las Entries pertenecen a proyectos. Collections y Records no.
- El área de una Entry se clasifica por separado y no se hereda del proyecto, a diferencia de los Records con su Collection.
- JEV elige el proyecto de cada Entry nueva entre los proyectos abiertos, o ninguno (`NULL`), y el resultado se guarda en `parentId` (tema 7). Las preferencias del tema 6 pueden orientarlo.

**Conclusión:** `parentId` genérico entre Entries; los Projects son Entries de kind `project`, creadas desde el panel, que actúan como padre.
