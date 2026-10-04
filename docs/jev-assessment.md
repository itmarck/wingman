# Wingman: JEV y simplificación

Evaluación del 3 de octubre de 2026, basada en el código local y la documentación oficial de TypeSafe. No se ejecutaron inferencias ni se midió la calidad de JEV con datos de Wingman.

## Recomendación

La dirección es viable: un gestor de tareas, eventos y acciones con un almacén de conocimiento acotado puede ser mucho más simple. La mayor reducción vendría de abandonar la composición universal de conocimiento y su compilador. JEV ayudaría a resolver decisiones semánticas concretas; cambiar de proveedor manteniendo el modelo actual conservaría casi toda su complejidad.

No todo el sistema necesita una decisión de IA. Vencimientos, dependencias, permisos, transiciones, recurrencias, idempotencia y transacciones ya son lógica determinista y deben seguir siéndolo. Sustituir esas reglas por llamadas a JEV añadiría coste e incertidumbre.

## Qué aporta JEV y dónde no basta

JEV responde preguntas con opciones cerradas (`Choice`), valoraciones (`Score`) y probabilidad de sí/no (`Noul`). Encaja para clasificar una entrada, elegir una entidad entre candidatos, detectar una intención o valorar relevancia. Varias preguntas independientes pueden compartir una petición. [Primitivas oficiales](https://docs.typesafe.ai/primitives).

No genera texto libre. Para títulos, nombres nuevos, hechos arbitrarios o citas hay que conservar fragmentos originales, obtener candidatos mediante parsers o usar un modelo generativo acotado. TypeSafe documenta extracción de fechas mediante componentes enumerados y selección de valores previamente detectados; eso permite reducir generación, pero no resuelve por sí solo cualquier entrada. [Extracción de valores](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook), [fechas](https://docs.typesafe.ai/cookbooks/date_extraction_cookbook).

Una salida válida puede ser una decisión equivocada. El proveedor reconoce limitaciones en números, fechas, contexto irrelevante, instrucciones adversarias y orden de opciones. Debemos recuperar pocos candidatos, ofrecer «ninguno/no determinado», validar en código y enviar incertidumbre a revisión. [Limitaciones](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

La tarifa publicada de `jev-1.13.0` es USD 0.042 por millón de tokens de entrada, con salida gratuita. Es un servicio remoto; el contenedor de Wingman no incluye el modelo. El inglés es su idioma más fuerte: hay que evaluar específicamente el español. Conviene fijar versión y registrar consumo, probabilidades y resultado; el coste total depende de cuántas preguntas y llamadas necesite cada entrada. [Modelos](https://docs.typesafe.ai/models).

## Estado real y superficie reemplazable

Antes de esta limpieza había aproximadamente 15.9 mil líneas TypeScript fuera de carpetas de pruebas y 5.2 mil de pruebas/soporte. El código ya había sustituido Concepts/Predicates/Axioms por Items/Components y persistía todo en PostgreSQL. Las instrucciones antiguas estaban desactualizadas.

| Área actual, tras la limpieza | Líneas TS sin pruebas | Cambio propuesto |
| --- | ---: | --- |
| `modules/interpretation` | 3,307 | Sustituir Drafts, declaraciones, compilación y publicación genérica por operaciones concretas. Conservar recuperación del trabajo y reintentos útiles. |
| `core/item` + `modules/knowledge` | 1,059 | Sustituir perfiles/componentes versionados universales por registros de producto y evidencia. |
| `adapters/inference` + `packages/inference` | 764 | Un adaptador de decisiones para JEV; generación opcional y explícita, si el producto la necesita. |
| `packages/evaluate` | 1,430 | Reutilizar casos semánticos valiosos; reemplazar el evaluador dependiente de Drafts por decisiones y resultados de producto. |

Son unas 6.6 mil líneas expuestas a sustitución, no 6.6 mil líneas eliminables sin reemplazo. No hay una cifra defendible de ahorro neto todavía. Un simple adaptador JEV ahorraría poco código; reducir el lenguaje de conocimiento y sus capas permitiría retirar mucho más.

Las consultas de planificación y la búsqueda de referencias cargan snapshots y reconstruyen componentes en memoria. Campos explícitos e índices SQL evitarían parte de esa reconstrucción. La composición central también conecta numerosos Commands, Queries, registries y módulos para operaciones pequeñas.

El producto ya cubre tareas, planes, hábitos, objetivos y notificaciones pasivas. Los Events de ejecución representan hechos técnicos; no son todavía un calendario de eventos. La única Capability registrada en la composición es `notification`. Calendario y acciones de servicios conectados deben tener contratos propios; JEV no aporta esas integraciones.

## Opciones para los datos

| Opción | Ventaja | Coste |
| --- | --- | --- |
| Tablas explícitas para tareas, eventos, entidades, hechos y relaciones | Consultas y reglas fáciles; menor abstracción | Añadir campos/migraciones cuando crezca el producto |
| Campos principales relacionales + JSONB acotado | Flexibilidad en atributos de conocimiento y payloads de conectores | Validar el JSONB y promover a columnas los campos consultados frecuentemente |
| Mantener Items/Components o un grafo universal | Flexibilidad para dominios desconocidos | Conserva buena parte de la complejidad que se quiere retirar |

Recomiendo la segunda: tareas/eventos con columnas explícitas; conocimiento mediante entidades y hechos de estructura pequeña, con atributos JSONB cuando haga falta. Entries originales, citas exactas y procedencia se conservan. Actualizaciones normales más historial de cambios suelen bastar; reservar versionado por hecho para conflictos o trazabilidad que el producto realmente utilice. No hace falta una base de grafos.

## Cómo quedaría el flujo y el código

Entrada → parsing y búsqueda de candidatos → decisiones JEV → comando tipado → validación y transacción → tarea/conocimiento/acción pendiente.

Tareas estructuradas de API o conectores pueden entrar directamente sin IA. Para texto libre tenemos dos variantes: JEV con parsers y fragmentos literales, aceptando revisión cuando falten datos; o JEV con un generador pequeño para extracción abierta. No introducir un LLM grande como fallback automático. El modelo nunca concede permisos ni ejecuta acciones directamente.

Organizar por áreas concretas (`tasks`, `knowledge`, `automation`, `decisions`, `http`, `storage`) con servicios y funciones legibles. Mantener interfaces en los límites útiles —base de datos, decisión y conectores— y eliminar clases de una sola operación, wrappers y registries cuando no aporten comportamiento. Fusionar paths duplicados de creación genérica y creación de planificación.

Conservar autenticación, evidencia, validación, migraciones, transacciones, consentimiento, deduplicación, recuperación tras reinicio y cierre del proceso. Las aprobaciones actuales guardan callbacks en memoria: si permanecen, deberían convertirse en comandos pendientes serializables y persistidos. Las migraciones desplegadas siguen siendo append-only; la transformación de datos debe ser explícita y comprobable.

## Limpieza realizada y pendiente

Retirados 156 archivos: 139 de OpenSpec sin cambios activos, seis skills locales de OpenSpec y once archivos de código/pruebas/inspector. Se retiraron alrededor de siete mil líneas del contenido versionado, mayormente documentación, skills, lockfile y snapshots; no equivale a siete mil líneas de lógica de negocio.

Se eliminaron el inspector sin autenticación, `pino-pretty`, `embedded-postgres`, snapshots de paridad conceptual antigua, tres operaciones sin referencias (`RegisterItemCommand`, `ResolveItemQuery`, `ReinterpretEntryCommand`) y una prueba textual que prohibía futuras migraciones. El runtime ya no cambia con `NODE_ENV`; logs JSON y rutas son comunes. El runner de migraciones pasó a dependencia de ejecución y el token se compila. La imagen final excluye pruebas y evaluadores compilados.

Quedan por retirar durante la migración los tests ligados al antiguo compilador, perfiles, formatos del proveedor y publicación genérica. Deben reemplazarse por pruebas de comportamiento de tareas/conocimiento. Mantener las de autenticación, persistencia, consentimiento, conflictos, citas, reintentos e idempotencia; los stores en memoria usados como dobles de prueba no son un backend alternativo de producción.

Antes de reemplazar la inferencia, evaluar entradas reales en español: múltiples tareas por mensaje, referencias ambiguas, negaciones, fechas relativas, datos ausentes y texto que intente alterar las instrucciones. Medir errores de acciones automáticas, porcentaje enviado a revisión, coste y latencia por entrada. La confianza reportada no sustituye estas mediciones.

## Contenedores y validación

Añadidos Dockerfile común para local/Railway y comandos de Podman en [README.md](../README.md#local-podman). Las pruebas usan PostgreSQL 18.4 real con una base generada por proyecto, sin consultar `DATABASE_URL`. Compilación, typecheck y las 111 pruebas restantes pasaron en contenedores. Se corrigió un fixture de sugerencia que había caducado por una fecha fija. La imagen de producción aplicó migraciones y respondió correctamente a health, readiness, OpenAPI y lectura autenticada; rechazó lectura sin token y ya no expone `/inspect`.

JEV todavía no está integrado. No se hicieron commits, despliegues ni modificaciones remotas. Los contenedores de validación son descartables; las imágenes locales quedan disponibles.
