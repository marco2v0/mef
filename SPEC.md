# SPEC — MentorIA Evaluación Formativa (MEF)

Módulo de redmagisterial.com que cierra el ciclo de MentorIA: el docente registra resultados de una actividad ya generada por MentorIA (planeación + reactivos alineados a PDA), Claude genera retroalimentación formativa por alumno, detecta brechas grupales, propone un ajuste de la siguiente planeación y sugiere Materiales Educativos Digitales (MED) del catálogo vía MCP.

Este documento es autocontenido: describe alcance, arquitectura, contratos de datos, flujo end-to-end y cómo verificar que todo funciona junto. Las decisiones aquí registradas vienen de una sesión de diseño con el equipo; donde hay una simplificación deliberada se marca explícitamente con **[ponytail]** y su condición de escalamiento.

## 1. Alcance

### Dentro de alcance (v1)

- Captura de resultados de actividad por grupo (score agregado por alumno + flags puntuales de atención).
- Generación de retroalimentación formativa individual por alumno, alineada a PDA.
- Detección de brechas grupales por PDA, con matiz estadístico por tamaño de grupo.
- Propuesta de ajuste de la siguiente planeación (diff editable, nunca aplicación automática).
- Sugerencia de MED del catálogo vía MCP, ligada a la propuesta de ajuste.
- Pseudonimización de datos de alumnos (menores de edad) antes de que cualquier dato llegue al modelo.
- Auditoría de aprobación/edición de propuestas.

### Fuera de alcance (v1, explícito)

- **Comunicación directa a padres/alumnos.** MEF solo produce artefactos para el docente; el envío de retroalimentación a alumnos o tutores queda para un módulo futuro.
- **Calificación oficial / boleta.** MEF es una capa formativa, no sumativa. No escribe en el sistema de calificaciones oficiales.
- **Detección de plagio/integridad académica como feature formal.** Solo existe un flag heurístico simple (respuestas idénticas entre alumnos); no se construye un sistema de detección robusto.
- **Multi-idioma / lenguas indígenas nacionales.** v1 es español únicamente.
- Login/identidad propia de MEF (usa el JWT que ya emite el backend de redmagisterial).
- Cola de mensajería distribuida (Redis/RabbitMQ) — ver §5, decisión ponytail.

## 2. Arquitectura general

```
Astro (redmagisterial.com)
  └─ Isla React "mef-island" (client:load)
        │ fetch + polling/SSE, Authorization: Bearer <JWT redmagisterial>
        ▼
Servicio MEF (Node + TS + Hono, desacoplado, propio despliegue)
  ├─ Middleware auth: valida JWT emitido por backend existente de redmagisterial
  ├─ Pseudonimización: tokeniza alumnoId → alias (A-NN) antes de tocar Claude
  ├─ Cola de jobs in-memory/SQLite (concurrencia 4 workers)
  ├─ Cliente Claude (Claude Enterprise org) — genera feedback, análisis de brechas, ajuste
  ├─ Cliente MCP → catálogo de MED (tool buscar_med)
  └─ Store cifrado: mapeo alias↔alumno real, resultados, propuestas, auditoría
        │
        ▼
Backend existente de MentorIA/redmagisterial (fuente de verdad de docentes, grupos,
alumnos, planeaciones, perfiles de adecuación curricular)
```

MEF nunca es la fuente de verdad de identidad de alumnos ni de planeaciones — las referencia por ID y pseudonimiza antes de generar contenido con Claude.

## 3. Pseudonimización

- El middleware de ingreso del servicio MEF tokeniza cada `alumnoId` real a un alias corto (`A-01`, `A-02`, ...) **antes** de que el payload llegue a cualquier función que arme un prompt para Claude.
- El mapeo `alias ↔ alumnoId` vive en una tabla propia, cifrada en reposo, dentro del store de MEF (no en el backend de MentorIA).
- La reversión (alias → nombre real) solo ocurre en la capa de presentación, al servir la respuesta a la isla React de un docente ya autenticado y autorizado sobre ese grupo (ver §7, autorización por `grupoId`).
- **Ningún punto de logging** (aplicación, llamadas a Claude, llamadas MCP, error tracking) debe registrar el alumnoId real, nombre, CURP o correo — solo el alias. Esto se audita explícitamente y se prueba (ver §11, verificación end-to-end).
- El alias es válido solo dentro del ciclo escolar activo (ver §9, retención).

## 4. Modelo de datos / interfaces (TypeScript)

```ts
// Entrada del docente
interface ResultadoActividadInput {
  actividadId: string;
  grupoId: string;
  cicloEscolarId: string;
  resultados: ResultadoAlumnoInput[];
}

interface ResultadoAlumnoInput {
  alumnoId: string; // real; se tokeniza en el borde del servicio, nunca persiste tal cual
  presente: boolean; // false => excluido de feedback individual y de brechas grupales
  scoreAgregado?: number; // requerido si presente = true
  flags?: Array<{ tipo: "atencion"; nota?: string }>;
}

// Post-pseudonimización (lo único que ve Claude y lo que persiste MEF)
interface ResultadoAlumnoPseudonimizado {
  alias: string; // "A-05"
  presente: boolean;
  scoreAgregado?: number;
  flags?: Array<{ tipo: "atencion"; nota?: string }>;
  adecuacionCurricular?: {
    // presente solo si MentorIA reporta adecuación para ese alumno
    criterioAjustado: string;
  };
}

// Salida por alumno: una entrada por alumno del lote, discriminada por estado
type EntradaRetroalimentacion =
  RetroalimentacionGenerada | RetroalimentacionSinDatos;

interface RetroalimentacionGenerada {
  alias: string;
  estado: "generado";
  pdaReferidos: string[]; // ids de la planeación; se validan en código, ver §6
  logros: string;
  brecha: string;
  siguientePaso: string;
  texto: string; // formativo, máximo 120 palabras, editable por el docente en UI
  requiereRevision: boolean; // true si citó PDA ajenos incluso tras el reintento
}

// Alumno ausente: aparece para que el docente lo vea, sin texto. No se le
// llama a Claude ni se le inventa evidencia (el campo `texto` no existe acá).
interface RetroalimentacionSinDatos {
  alias: string;
  estado: "sinDatos";
}

// Análisis grupal
interface AnalisisBrechas {
  grupoId: string;
  actividadId: string;
  n: number; // alumnos con datos (presente = true)
  nTotalGrupo: number;
  datosInsuficientes: boolean; // true si falta > 30% del grupo (umbral configurable)
  umbralMinimoNParaCerteza: number; // default 8
  confianza: "alta" | "baja"; // "baja" si n < umbralMinimoNParaCerteza
  pdaNoLogrados: Array<{
    pda: string;
    porcentaje: number; // sobre los n con datos, no sobre nTotalGrupo
    patron: string; // error común observado, ej. "confunden un detalle con la idea central"
  }>;
  fortalezas: string[]; // del grupo; nunca nombra alumnos
  recomendacionGeneral: string;
  flagsSospecha?: Array<{
    alumnos: string[]; // aliases involucrados
    alcance: "individual" | "grupoCompleto"; // grupoCompleto => posible falla del instrumento, no de alumnos
    nota: string;
  }>;
}

// Propuesta de ajuste de planeación (nunca se auto-aplica)
interface PropuestaAjustePlaneacion {
  id: string;
  planeacionId: string;
  actividadId: string;
  estado: "borrador" | "revisado" | "aprobado" | "descartado";
  cambiosSecuencia: Array<{
    tipo: "agregar" | "modificar" | "mantener";
    descripcion: string; // ej. "agregar actividad remedial de 20 min sobre F3.LEN.02.1"
    pdaRelacionado?: string;
  }>;
  actividadRemedial: {
    descripcion: string;
    duracionMin: number;
    pdaObjetivo: string;
  };
  medSugeridos: MedSugerido[]; // vacío hasta que buscar_med (MCP) lo llene, ver §8
  auditoria: {
    creadoEn: string;
    aprobadoPor?: string; // docenteId
    aprobadoEn?: string;
    editadoRespectoOriginal: boolean; // métrica de calidad: tasa de edición
  };
}

interface MedSugerido {
  medId: string;
  titulo: string;
  fuente: "mcp-buscar_med"; // nunca "modelo" — anti-alucinación, ver §8
  url?: string;
}

// Job asíncrono. Es también el sobre de resultados: el polling lee de acá.
interface JobProgreso {
  jobId: string;
  estado: "encolado" | "procesando" | "completado" | "error";
  total: number; // solo alumnos presentes
  completados: number;
  requierenRevision: string[]; // aliases que fallaron 2x
  retroalimentaciones?: EntradaRetroalimentacion[]; // parcial mientras procesa
  brechas?: AnalisisBrechas; // al cerrar el lote
  ajuste?: PropuestaAjustePlaneacion; // después de brechas
}
```

## 5. Cola de jobs y ejecución

Un lote de resultados (ej. 30 alumnos) se procesa así:

1. `POST /v1/retroalimentacion` valida el input, tokeniza alumnos, encola un job y responde de inmediato con `{ jobId, estado: "procesando" }`.
2. El worker procesa feedback individual con **concurrencia 4**. Al terminar todos los individuales, corre el análisis de brechas grupal.
3. Si un alumno específico falla 2 veces (ej. no se puede mapear su PDA), queda marcado `requiereRevision: true` **sin bloquear a los demás**; el docente puede reintentarlo puntualmente vía `POST /v1/retroalimentacion/{jobId}/alumnos/{alias}/reintentar`.
4. El `jobId` se persiste en URL/localStorage del cliente — si el docente cierra o recarga la pestaña, el job sigue corriendo server-side y el progreso se recupera consultando `GET /v1/retroalimentacion/{jobId}`.
5. La isla React hace polling (o SSE) sobre ese endpoint para mostrar "18/30 completados".

**[ponytail]** La cola es in-memory/SQLite, no Redis/RabbitMQ — el volumen esperado (lotes por grupo, no miles de eventos concurrentes) no lo justifica. Escalar a cola distribuida si: (a) se corren múltiples instancias del servicio en paralelo sin estado compartido, o (b) el volumen de lotes concurrentes por escuela crece a un punto donde SQLite es cuello de botella de escritura.

## 6. Análisis de brechas grupales — casos borde de datos

- **Alumno ausente/sin resultado** (`presente: false`): excluido tanto del feedback individual (nunca se genera texto inventado) como del denominador de `AnalisisBrechas`. En UI aparece como "sin datos", nunca como feedback vacío o genérico.
- **Patrón sospechoso** (respuestas idénticas entre alumnos): MEF nunca acusa ni decide. Genera un `flagSospecha` informativo ("posible coincidencia entre A-05 y A-12") visible solo para el docente. Si el patrón involucra **todo el grupo**, el flag se marca `alcance: "grupoCompleto"` — señal de que puede ser un problema del instrumento de evaluación, no de los alumnos.
- **Alumno con adecuación curricular (NEE)**: si el perfil del alumno en MentorIA ya registra una adecuación, MEF ajusta el `criterioAjustado` esperado para ese alumno en vez de aplicar el estándar grupal. **Dependencia abierta**: requiere confirmar con el equipo de MentorIA que el campo de adecuación curricular existe y es consultable por `alumnoId` antes de tokenizar (ver §12).
- **Grupo con datos insuficientes**: si falta más del 30% del grupo (umbral configurable), `AnalisisBrechas.datosInsuficientes = true` y no se generan conclusiones de brecha — se indica explícitamente cuántos faltan en vez de inventar un patrón.
- **Bajo N (sesgo estadístico)**: con `n < 8` (umbral configurable), las brechas se reportan igual pero con `confianza: "baja"` y lenguaje cauteloso en la UI ("muestra pequeña, interpretar con cautela"). Esto es deliberado para no dejar sin ningún análisis a escuelas rurales con grupos chicos — se matiza, no se omite.

## 7. Autenticación y autorización

- El servicio MEF **no tiene login propio**. Valida un JWT emitido por el backend existente de redmagisterial, con claims `docenteId`, `escuelaId`, `grupoIds`.
- Middleware de autorización: además de validar la firma del JWT, verifica que el `grupoId` del payload esté dentro de `grupoIds` del token — un docente no puede registrar ni leer resultados de un grupo que no le pertenece, incluso con JWT válido.
- La resolución de alias → nombre real (§3) solo ocurre si esta verificación pasa.

## 8. Integración MCP — catálogo de MED

- Flujo de dos fases: (1) Claude genera retroalimentación individual y la propuesta de ajuste de planeación; (2) por separado, se invoca el tool MCP `buscar_med` (async) para obtener candidatos reales del catálogo; (3) los resultados se combinan en `PropuestaAjustePlaneacion.medSugeridos` antes de mostrarse al docente.
- **Anti-alucinación**: cada entrada de `medSugeridos` se valida en código contra el resultado real devuelto por la llamada a `buscar_med` en esa misma sesión — nunca se acepta un MED que no venga de esa respuesta. Si `buscar_med` no devuelve nada, `medSugeridos` queda vacío; el sistema **no inventa** un MED para no dejar el campo vacío.

## 9. Retención de datos

- El mapeo alias↔alumno, los resultados y el feedback generado viven mientras el ciclo escolar (`cicloEscolarId`) está activo.
- Un job de limpieza purga automáticamente al cierre de ciclo escolar, salvo que el docente exporte antes (export queda fuera de alcance de v1 como feature, pero el job de purga debe dar margen/aviso previo).

## 10. Evals

Restricción del proyecto: evals obligatorias antes de producción. Decisión de v1: **auditoría humana continua**, sin harness automatizado tipo LLM-judge en esta primera versión — evitar sobre-ingeniería antes de tener volumen real de uso.

Mínimo no negociable:

- Antes de habilitar el módulo para un grupo de docentes piloto, un conjunto curado de muestras (resultados reales o sintéticos representativos) pasa por revisión humana pedagógica antes de considerar el prompt "listo".
- En producción, muestreo recurrente (ej. X% de propuestas por semana) revisado por alguien del equipo pedagógico.
- La **tasa de edición** de propuestas (aprobado sin cambios vs. editado antes de aprobar, ver `auditoria.editadoRespectoOriginal`) se trackea como métrica de producto: si el docente aprueba ~100% sin editar, es señal de aprobación automática sin lectura, y dispara rediseño de la UI de revisión — no es solo una métrica de calidad del modelo, es una señal de riesgo de sobreconfianza (§11).

**[ponytail]** Escalar a harness automatizado (golden dataset + LLM-as-judge en CI) si: el volumen de generación crece a un punto donde el muestreo humano no cubre proporción suficiente, o el equipo pedagógico reporta que la revisión manual no detecta regresiones entre cambios de prompt.

## 11. Riesgos y mitigaciones

| Riesgo                                                          | Mitigación                                                                                                                                                                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sobreconfianza docente / reemplazo de juicio pedagógico         | Todo output (feedback individual, brechas, ajuste de planeación) se presenta como propuesta editable con estados `borrador → revisado → aprobado`, nunca como veredicto final. Tasa de edición trackeada (§10).                                          |
| Alucinación de MED inexistente                                  | `medSugeridos` solo desde resultados reales de `buscar_med` (§8); nunca inventado.                                                                                                                                                                       |
| Exposición de PII de menores fuera del perímetro pseudonimizado | Auditoría explícita de cada punto de logging (app, MCP, Claude, error tracking); solo el alias se registra. Se prueba intentando loggear un dato real y verificando que quede bloqueado también en logs, no solo en el código fuente que arma el prompt. |
| Sesgo por bajo N (grupos pequeños/escuelas rurales)             | Umbral `n ≥ 8` antes de reportar brecha con lenguaje de certeza; por debajo, se reporta con `confianza: "baja"` y lenguaje cauteloso, nunca se omite (§6).                                                                                               |

## 12. Dependencias / preguntas abiertas

- Confirmar con el equipo de MentorIA que el perfil de alumno expone un campo de adecuación curricular (NEE) consultable por `alumnoId` antes del punto de tokenización — de no existir, el ajuste diferenciado de criterio (§6) no puede implementarse en v1 y debe degradarse a un flag informativo simple.
- Confirmar el mecanismo exacto de verificación de firma del JWT (clave pública compartida vs. introspección contra endpoint del backend existente).
- Definir el umbral exacto de "datos insuficientes" (30% propuesto) y de "bajo N" (8 propuesto) con el equipo pedagógico — quedan como configuración, no hardcodeados en el dominio.

## 13. Estructura de archivos propuesta

```
packages/mef-service/
  src/
    index.ts                          # entry point Hono
    auth/jwt.ts                       # valida JWT redmagisterial, extrae claims
    domain/types.ts                   # interfaces de §4
    pseudonimizacion/
      tokenizer.ts                    # alumnoId -> alias, en el borde de entrada
      store.ts                       # tabla cifrada alias<->alumnoId
    jobs/
      queue.ts                        # cola in-memory/SQLite
      worker.ts                       # concurrencia 4, retry por alumno
    claude/
      client.ts
      prompts/
        feedback-individual.ts
        analisis-brechas.ts
        ajuste-planeacion.ts
    mcp/
      med-catalog-client.ts           # tool buscar_med
    routes/
      retroalimentacion.ts            # POST /v1/retroalimentacion, GET .../{jobId}, POST .../reintentar
      planeacion-ajuste.ts            # GET/POST aprobar|descartar
      health.ts
    db/
      schema.sql
      retention-job.ts                # purga al cierre de ciclo escolar
    openapi/
      mef.openapi.yaml                # contrato OpenAPI completo
  test/
    unit/
    e2e/
    evals/
      golden-samples/                # muestras curadas para revisión pre-lanzamiento
      audit-sampling.md               # proceso de muestreo en producción

astro-integration/mef-island/
  mef-island.astro                   # wrapper, client:load
  MefPanel.tsx
  components/
    CapturaResultados.tsx
    ProgresoJob.tsx
    FeedbackAlumnoCard.tsx
    AnalisisBrechasPanel.tsx
    PropuestaAjustePlaneacion.tsx     # diff viewer, aprobar/editar/descartar
  hooks/
    useJobPolling.ts
    useMefApi.ts

docs/
  SPEC.md                            # este documento
```

## 14. Contrato de API (resumen)

| Endpoint                                                   | Método | Descripción                                                                           |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `/v1/retroalimentacion`                                    | POST   | Recibe `ResultadoActividadInput`, tokeniza, encola job. Devuelve `{ jobId, estado }`. |
| `/v1/retroalimentacion/{jobId}`                            | GET    | Devuelve `JobProgreso`, que ya trae `retroalimentaciones`, `brechas` y `ajuste`.      |
| `/v1/retroalimentacion/{jobId}/alumnos/{alias}/reintentar` | POST   | Reintenta un alumno puntual marcado `requiereRevision`.                               |
| `/v1/planeacion-ajuste/{actividadId}`                      | GET    | Devuelve `PropuestaAjustePlaneacion` en su estado actual.                             |
| `/v1/planeacion-ajuste/{id}/aprobar`                       | POST   | Body opcional con ediciones; marca `aprobado`, registra auditoría.                    |
| `/v1/planeacion-ajuste/{id}/descartar`                     | POST   | Marca `descartado`.                                                                   |
| `/v1/health`                                               | GET    | Liveness/readiness.                                                                   |

Todos los endpoints (excepto `/health`) requieren `Authorization: Bearer <JWT>` y aplican la verificación de `grupoId ∈ grupoIds` (§7). El contrato completo vive en `packages/mef-service/src/openapi/mef.openapi.yaml`.

## 15. Verificación end-to-end

Pasos concretos para validar que el módulo funciona integrado, antes de considerar una entrega lista:

1. **Setup**: crear un grupo de prueba con 10 alumnos en MentorIA (incluyendo 1 con adecuación curricular registrada y 1 marcado ausente), con una actividad ya generada y alineada a PDA.
2. **Auth**: obtener un JWT válido del backend de redmagisterial para un docente dueño de ese grupo; confirmar que un JWT de un docente **sin** ese grupo recibe 403 al intentar `POST /v1/retroalimentacion`.
3. **Captura**: `POST /v1/retroalimentacion` con resultados de los 10 alumnos (incluyendo el ausente sin score, y dos alumnos con respuestas idénticas a propósito). Confirmar respuesta inmediata `{ jobId, estado: "procesando" }`.
4. **Pseudonimización**: inspeccionar logs de la corrida completa (app, llamadas a Claude, llamadas MCP) y confirmar que **no aparece** ningún `alumnoId` real, nombre, CURP o correo — solo alias `A-NN`.
5. **Progreso**: hacer polling a `GET /v1/retroalimentacion/{jobId}` y confirmar que el contador avanza (ej. "6/9 completados", el ausente no cuenta) hasta `completado`.
6. **Resultados individuales**: confirmar que el alumno ausente aparece con `estado: "sinDatos"` (no con feedback inventado), que el alumno con adecuación tiene su criterio ajustado reflejado en el `texto`, y que el flag de sospecha aparece para el par de respuestas idénticas con `alcance: "individual"`.
7. **Brechas grupales**: confirmar que `AnalisisBrechas.n` excluye al ausente, y que con `n < 8` el resultado trae `confianza: "baja"` en cada brecha reportada (con 9 presentes de 10, ajustar el escenario de prueba para cruzar el umbral en ambos sentidos si se quiere probar los dos casos).
8. **Propuesta de ajuste**: confirmar que se generó una `PropuestaAjustePlaneacion` en estado `borrador`, con al menos un `medSugeridos[]` cuya `fuente` sea `"mcp-buscar_med"` — y por separado, simular que `buscar_med` no devuelve resultados y confirmar que `medSugeridos` queda vacío y **no** trae un MED inventado.
9. **Aprobación y auditoría**: aprobar la propuesta sin editar vía `POST /v1/planeacion-ajuste/{id}/aprobar`; confirmar que `auditoria.aprobadoPor`, `aprobadoEn` quedan registrados y `editadoRespectoOriginal: false`. Repetir editando `cambiosSecuencia` antes de aprobar y confirmar `editadoRespectoOriginal: true`.
10. **Recuperación de sesión**: a mitad del job (paso 5), simular cierre/recarga de la pestaña del docente; confirmar que al volver a abrir con el mismo `jobId` (desde localStorage) el progreso se recupera sin reiniciar el procesamiento server-side.
11. **Retención**: simular cierre de `cicloEscolarId` y confirmar que el job de purga elimina el mapeo alias↔alumno y los datos asociados a ese ciclo.
12. **Expiración de sesión**: con un job en progreso o una propuesta sin aprobar, forzar la expiración del JWT (ej. usando uno con `exp` ya vencido) y hacer un request. Confirmar `401` explícito, y confirmar que la isla React preserva cualquier edición no guardada antes de redirigir a re-autenticación.

Si los 12 pasos pasan, el módulo cumple el contrato de este SPEC de punta a punta.

## 16. Manejo de errores

Convención única para todo error que cruce un límite del servicio (HTTP, Claude, MCP, DB). El objetivo: el docente nunca ve un stack trace ni un dato de alumno real en un mensaje de error, y todo fallo es diagnosticable por `requestId` sin necesitar reproducirlo.

### 16.1 Taxonomía y códigos HTTP

| Categoría                    | HTTP | Ejemplo                                                             | Retryable por cliente      |
| ---------------------------- | ---- | ------------------------------------------------------------------- | -------------------------- |
| Input inválido (Zod)         | 400  | `resultados[]` vacío, `scoreAgregado` faltante con `presente: true` | No — corregir input        |
| Auth ausente/inválida        | 401  | JWT expirado o firma inválida                                       | No — reautenticar          |
| Autorización insuficiente    | 403  | `grupoId` fuera de `grupoIds` del token (§7)                        | No                         |
| Recurso no encontrado        | 404  | `jobId` o `id` de propuesta inexistente                             | No                         |
| Fallo de dependencia externa | 502  | Claude o `buscar_med` no responde / responde inválido               | Sí, con backoff (ver 16.3) |
| Error interno no clasificado | 500  | Excepción no prevista                                               | No — reportar `requestId`  |

Todo error HTTP responde con la misma forma, sin excepción:

```ts
interface ErrorResponse {
  error: {
    code: string; // "INPUT_INVALIDO" | "NO_AUTORIZADO" | "DEPENDENCIA_EXTERNA" | ...
    message: string; // texto seguro para mostrar al docente, sin PII ni detalle interno
    requestId: string; // para correlacionar con logs
  };
}
```

`message` es siempre texto genérico orientado al docente; el detalle técnico (stack, payload que falló) va solo al log correlacionado por `requestId`, nunca a la respuesta.

### 16.2 Errores por alumno dentro de un job

Ya definido en §5: un alumno que falla 2 veces queda `requiereRevision: true` **sin bloquear el resto del lote**. Esto es manejo de errores a nivel de dominio, no una excepción HTTP — el job global termina en `estado: "completado"` aunque algunos alumnos queden pendientes de revisión; solo pasa a `estado: "error"` si falla algo que afecta al lote completo (ej. la conexión a Claude cae por completo, no un alumno puntual).

### 16.3 Fallos de dependencias externas (Claude, MCP)

- **Claude devuelve output que no valida contra el schema** (`packages/service/src/schemas/`): se trata como fallo del alumno puntual (§16.2), nunca se acepta un output parcialmente válido ni se "arregla" el JSON a mano.
- **Claude o `buscar_med` no responden / timeout**: reintento simple, 2 intentos con delay fijo antes de marcar `requiereRevision` (alumno) o dejar `medSugeridos` vacío (§8). **[ponytail]** delay fijo, no backoff exponencial ni circuit breaker — el volumen esperado (lotes por grupo) no lo justifica; escalar si aparecen fallos en cascada que un retry simple no absorbe.
- Ningún fallo de `buscar_med` es fatal para el job: un `medSugeridos` vacío es un estado válido (§8), no un error.

### 16.4 Logging de errores

- Todo log de error incluye `requestId` y, si aplica, `alias` — nunca `alumnoId`, nombre, CURP o correo (regla dura de §3, auditada en §11).
- El body/payload que causó el fallo se loggea ya pseudonimizado (post-tokenización), nunca el input crudo del docente antes de tokenizar.

### 16.5 Errores no capturados

Un `try/catch` global en el entry point (Hono) captura cualquier excepción no prevista, la loggea completa (con `requestId`) y responde `500` con el `ErrorResponse` genérico de 16.1 — nunca deja escapar el stack trace ni el mensaje nativo de la excepción al cliente.
