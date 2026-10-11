# Evaluación de JEV y dirección del producto

Documento de referencia para continuar Wingman. Recoge la comparación de idioma ya
ejecutada y las decisiones e ideas de producto planteadas después del plan de
migración. Estado revisado el 10 de octubre de 2026. Describe el código actual y
separa lo acordado de lo que sigue abierto.

## Evaluación de idioma

Se evaluaron 18 pares de entradas equivalentes: 14 Entry y 4 Note. Cada par se
envió una vez en español y otra en inglés, para un total de 36 solicitudes a JEV
con jev-1.13.0. Se alternó cuál idioma se enviaba primero. Se usaron las mismas
preguntas e instrucciones; no se tradujo una entrada antes de clasificarla. Los
casos, el script y las respuestas están en [jev-language-cases.json](../temp/jev-language-cases.json),
[jev-language-eval.mjs](../temp/jev-language-eval.mjs) y
[jev-language-results.json](../temp/jev-language-results.json).

| Comparación | Pares coincidentes |
| --- | ---: |
| Destino efectivo, después del umbral de confianza de 0.8 | 15/18 |
| Área efectiva, después del umbral de confianza de 0.8 | 15/18 |
| Destino y área efectivos, ambos iguales | 12/18 |
| Opción elegida por JEV antes del umbral, destino | 16/18 |
| Opción elegida por JEV antes del umbral, área | 16/18 |

El código convierte una respuesta con confianza inferior a 0.8 en
undetermined, así que la opción elegida por JEV puede diferir de la decisión
efectiva. Por ejemplo, para “Preparar y enviar la factura del proyecto a mi
cliente esta tarde”, JEV eligió task en ambos idiomas, con confianza 0.81 en
español y 0.40 en inglés; después del umbral, solo el español quedó como task.
Para la cita con el dentista, ambos eligieron task y wellbeing, pero la
respuesta inglesa quedó como undetermined por confianza 0.63. Para “Llamar a mi
mamá esta noche”, ambos eligieron el área social, pero solo el español quedó
por debajo del umbral (0.61).

Esto también afecta la decisión reciente de exigir un área: “Comprar un
cuaderno para el curso” obtuvo maintenance en ambos idiomas antes del umbral,
pero el inglés quedó undetermined por confianza 0.74. La llamada a la madre
obtuvo social en ambos; el español quedó undetermined por confianza 0.61. La
regla de confianza actual está ocultando algunas de las opciones de área que
JEV ya eligió.

Estos datos muestran concordancia entre las dos formulaciones, no exactitud.
Los casos son sintéticos, las equivalencias se prepararon para esta prueba y
las etiquetas expected reflejan el criterio inicial de quien diseñó los casos,
no una verdad de referencia revisada por el usuario. Hubo una respuesta por
idioma y caso, y la muestra es pequeña. Además, la instrucción actual del
clasificador describe el texto como “Spanish user data”, incluso para los casos
en inglés. Por eso la prueba no aísla perfectamente el idioma; esta instrucción
debe neutralizarse antes de una comparación mayor.

**Decisión:** conservar el texto original tal como lo envía el usuario y
mantener código e instrucciones de JEV en inglés. Esta evaluación no justifica
añadir un traductor ni demuestra que un idioma sea superior. JEV presenta el
inglés como idioma principal en su documentación, lo cual puede servir como
hipótesis para una prueba posterior, no como motivo suficiente para traducir
cada captura ([documentación de modelos](https://docs.typesafe.ai/models)).

## Comportamiento actual al capturar

Wingman guarda primero el texto original. Después, el Processor envía a JEV el
texto y el inputMode (Entry o Note) en state, y solicita dos decisiones de
opción cerrada: destination y area. JEV clasifica; no genera texto ni ejecuta
acciones externas, y no recibe automáticamente el historial. La integración
llama a la API HTTP directamente; no necesita un SDK. Las agent skills de JEV
son instrucciones para que un agente de desarrollo use sus capacidades; no
hacen falta en el servicio de Wingman en tiempo de ejecución ([agent skill de
JEV](https://docs.typesafe.ai/agent-skill)).

Hoy el validador transforma a undetermined cualquier destino o área con
confianza menor que 0.8. Una Entry crea una Task solo si usa el preset
taskCapture, este está habilitado en settings, JEV devuelve task, hay un área
efectiva y plannedFor fue proporcionado. En otros casos la captura se conserva
y, para taskCapture, se muestra un aviso. Una Note explícita no crea una Task.

La instrucción debe decir que el texto es contenido del usuario en su idioma
original, no afirmar que siempre está en español. La decisión acordada sobre
área obligatoria aún no está implementada: el contrato actual admite
undetermined y aplica el umbral también al área.

## Destino y área

Los destinos actuales significan:

| Destino | Significado |
| --- | --- |
| task | Una acción personal concreta, explícita, no negada, hipotética ni completada, representable como una Task sencilla. |
| keep | Información, reflexión o conocimiento que se conserva sin crear una acción. Una Note explícita permanece como Note. |
| unsupported | La intención es clara, pero requiere una capacidad no soportada, como varias acciones o actuar sobre un servicio externo. Se conserva la entrada y se indica que no se ejecutó. |
| undetermined | Falta evidencia o la intención es ambigua. No significa un fallo técnico. |

Ejemplos para distinguirlos: “A mi hermana le gusta conversar los domingos” es
información que se puede conservar (`keep`); “Mañana lo reviso” puede ser una
intención o solo una observación y el destino puede quedar `undetermined`; “Envía
este correo” tiene una intención clara, pero requiere una acción externa no
soportada (`unsupported`). El área responde otra pregunta: incluso si el destino
es `undetermined`, el usuario quiere que se elija el área más probable.

Es razonable mantener incertidumbre para el destino: una decisión equivocada
podría crear una tarea que el usuario nunca pidió. El usuario ha especificado
que el área siempre debe ser la opción real más apropiada, aunque falte
contexto. Las siete áreas actuales son employment, freelance, venture,
wellbeing, maintenance, social y entertainment. Se clasifica por propósito y
no por palabra aislada: un curso requerido para el empleo puede ser
employment; aprender por ocio puede ser entertainment. Si la inferencia no
coincide con su intención, el usuario podrá corregirla. El contrato futuro
debe exigir una de las siete áreas y no convertirla en undetermined por baja
confianza. La confianza puede conservarse para diagnóstico.

## Personalización y reglas

JEV no aprende preferencias de las solicitudes pasadas. La configuración
actual solo incluye el texto recibido y preguntas estáticas en código; no
consulta Entries o Notes previas. Esto evita que una frase guardada como
información se convierta accidentalmente en una instrucción.

La personalización puede añadirse con pocas preferencias explícitas y
confirmadas por el usuario. Ejemplos: “Los cursos requeridos para mi puesto
pertenecen a employment” y “Una actividad ya terminada no crea una Task”. En
cada decisión, Wingman podría recuperar solo las reglas pertinentes e
incluirlas separadas del texto original. El texto de una captura sigue siendo
dato, no instrucción. Una corrección recurrente podría sugerir una regla, pero
no debería convertirse en política permanente sin confirmación.

Las reglas deberían ser legibles, editables, acotadas y tener un ámbito claro
(por ejemplo, clasificación de área o captura de tareas). Se puede acordar que
una regla más específica prevalezca sobre una general; contradicciones y orden
de prioridad necesitan ejemplos reales. No hace falta crear ahora un lenguaje
de reglas, un motor de plugins ni enviar toda la memoria en cada solicitud.
Las Entries normales no son reglas por defecto. Una Note de preferencias
tendría que marcarse y confirmarse explícitamente.

También podrían clasificarse prioridad, urgencia, esfuerzo o referencias a
Records/Collections. No conviene añadir esas dimensiones sin un uso concreto y
un criterio personal. Prioridad debe cambiar algo en la vista u orden de Tasks
y no confundirse con una fecha de vencimiento. Quedan para más adelante, sin
campos ni opciones anticipadas.

## Organizar la información para poder usarla

El núcleo ya separa contenido y acción: Entries/Notes guardan texto, Records
pertenecen a Collections, Tasks representan acciones y Links relacionan
objetos sin ejecutar acciones. Las relaciones estructurales, como Record con
Collection, no se duplican como Links.

La utilidad debería venir de flujos consultables, no de una jerarquía nueva:
ver las Tasks del día y su estado; abrir una Collection y consultar sus
Records; relacionar una Note con una Task, Record o Collection; y recuperar
solo las reglas pertinentes al clasificar. Una vista de diario podría combinar
Entries/Notes, fechas, Records y trabajo relacionado sin requerir otro tipo de
entidad.

Para mejorar esos flujos, conviene preservar el texto original y registrar la
clasificación aplicada, su modelo y fecha. Una corrección futura podría ser
evidencia explícita para revisar preferencias, sin reescribir la entrada.
Búsqueda general, embeddings, extracción abierta y contexto de todo el
historial deben esperar hasta que exista una consulta concreta que los
necesite.

## API de Collections y Records: pendiente

El usuario prefiere consultar Records a través de su Collection y cuestiona
un endpoint global de Records. Una propuesta para evaluar es
GET /api/collections/{collectionId}/records para listar y
POST /api/collections/{collectionId}/records para guardar dentro de la
Collection, con un endpoint de detalle por recordId si la UI lo necesita; no
habría /api/records global. El UUID sería la identidad canónica porque el
nombre de Collection puede cambiar; un nombre legible podría ser un alias
opcional. Es una propuesta, no una decisión cerrada. El código actual expone
GET/POST /api/collections y POST /api/content/records.

## Próximos pasos recomendados

1. Hacer que el área siempre sea una de las siete opciones y no aplicar el
   umbral 0.8 al área. Mantener la abstención por baja confianza para destino
   y creación de Tasks.
2. Corregir la instrucción para aceptar el idioma original, manteniendo
   intacto el texto y el código/instrucciones en inglés.
3. Revisar con el usuario ejemplos representativos de áreas y reglas; guardar
   correcciones como preferencias explícitas, no como aprendizaje implícito.
4. Antes de decidir sobre traducción, evaluar más casos representativos con
   instrucciones neutrales. Si se compara con traducción, usar los mismos
   casos y mantener las respuestas reales separadas de fixtures de tests.
5. Resolver las rutas de Records al trabajar en el flujo de Collections. No
   incorporar todavía prioridad ni motor de reglas.

Este reporte no ha realizado solicitudes a JEV ni cambios de código. La
comparación guardada es exploratoria y no reemplaza una evaluación de calidad
con ejemplos personales.
