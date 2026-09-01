# Decisiones — MEF

Mini-ADR por ronda de coordinación entre los agentes `backend` y `frontend`.
Formato: contexto → decisión → consecuencia.

---

## ADR-001 — Ronda 1: publicación del contrato del esqueleto y evaluación de UI

**Fecha:** 2026-09-01

### Contexto

`packages/service` acaba de commitearse como esqueleto (`189bc97`, rama
`feat/esqueleto-service`): 7 endpoints Hono, schemas Zod, repositorio SQLite con
datos mock y `openapi.yaml`, sin llamadas a Claude. `packages/ui` está vacío.

Se pidió a `backend` publicar el contrato real del código (no el declarado en el
YAML) y a `frontend` evaluar si con ese contrato puede avanzar.

### Decisión

Se publicó el contrato de los 7 endpoints en formato fijo, reportando en el campo
`auth:` **la realidad del código y no lo que declara el YAML**. Los 6 endpoints de
negocio quedan marcados `auth: NO IMPLEMENTADA`.

`frontend` no escribió código. Declaró bloqueada la construcción de componentes
hasta resolver una contradicción de stack, y acotó qué es integrable hoy.

### Consecuencia

**Integrable hoy contra el backend real:** `CapturaResultados`
(`POST /v1/retroalimentacion`) y el polling de `ProgresoJob` limitado a los
estados `encolado`/`procesando`/`error`.

**No integrable, con causa identificada:**

- `FeedbackAlumnoCard` y `AnalisisBrechasPanel` — dependen de datos que ningún
  punto del sistema produce todavía (falta el worker).
- `PropuestaAjustePlaneacion` — no hay camino que cree una `AjustePlaneacion` en
  estado `borrador`.
- Manejo de 401/403 — sin middleware de auth esos caminos no se pueden ejercitar.

**Rama muerta del contrato:** como nada mueve el job de `"encolado"`, el
`GET /v1/retroalimentacion/{jobId}` con `retroalimentaciones[]` y `brechas` que
promete `openapi.yaml` es hoy inalcanzable end-to-end. No es un stub parcial: es
una rama del contrato sin ningún camino de ejecución.

**Dos desviaciones respecto de `SPEC.md`, señaladas sin resolver:**

1. **Punto de pseudonimización.** `SPEC.md` §3 pone la tokenización
   `alumnoId → alias` en el middleware de ingreso de MEF, y §4 define
   `ResultadoAlumnoInput` con `alumnoId` real. El `ResultadoActividadInput`
   implementado arranca directo en `alias`, delegando la tokenización al
   llamante. No viola la regla dura (no hay ningún `alumnoId` en el código), pero
   mueve la responsabilidad sobre PII de menores fuera del servicio. Hay que
   decidir: se implementa el middleware que pide el SPEC, o se corrigen §3/§4 y
   el `openapi.yaml` para declarar que MEF recibe datos ya pseudonimizados.

2. **Stack de la UI.** `SPEC.md` §2 y §13 especifican isla **React** dentro de
   Astro en `astro-integration/mef-island/`. El paquete real es `packages/ui` y
   el agente asignado es **Angular 1.8**. `packages/ui` está vacío, sin ninguna
   señal en el repo de un pivote. **Decisión pendiente del equipo**, bloquea todo
   componente: el nombre de carpeta, el mecanismo de módulos y hasta cómo llega
   el JWT al componente dependen de ella.

**Menores:** `GET /planeacion-ajuste/{ref}` acepta `actividadId` o `id` de
propuesta indistintamente y el YAML sólo documenta `actividadId`. `SPEC.md` cita
rutas bajo `packages/mef-service/`, el paquete real es `packages/service/`.

### Necesidad abierta que pasa a la ronda 2

```
Necesito: mecanismo de datos de prueba para POST /v1/planeacion-ajuste
  - request: alguna forma de sembrar una AjustePlaneacion en estado "borrador"
    para un planeacionId/actividadId dado (fixture de dev, seed script o
    endpoint interno)
  - response: { id, planeacionId, actividadId, estado:"borrador", diff:[],
    auditoria:{creadoEn} }
  - errores esperados: ninguno adicional, es sólo para desarrollo
  - por qué: hoy no existe ningún camino que produzca un borrador de ajuste, así
    que no se puede obtener un `ref` real para integrar PropuestaAjustePlaneacion
```

---

## ADR-002 — Ronda 2: la necesidad de fixture ya estaba cubierta

**Fecha:** 2026-09-01

### Contexto

`frontend` pidió un mecanismo para sembrar una `AjustePlaneacion` en estado
`borrador` (fixture, script o endpoint interno), porque sin un `ref` real no
puede integrar `PropuestaAjustePlaneacion`. La petición mencionaba un
`POST /v1/planeacion-ajuste` que no existe en el contrato.

### Decisión

**No se agregó código.** La necesidad ya está cubierta por el seed de desarrollo
que se commiteó con el esqueleto.

Se descartó explícitamente crear un endpoint interno de escritura. Razón: el
middleware de auth no existe, así que un endpoint de creación sería superficie de
escritura sin ninguna validación, sumando riesgo al hueco ya documentado en
`app.ts`. Además, crear la propuesta en `borrador` es responsabilidad del worker
de Claude (`SPEC.md` §5, §8), no de un endpoint HTTP — el contrato de §14 sólo
define `GET {ref}`, `POST {id}/aprobar` y `POST {id}/descartar`.

### Consecuencia

Camino de desbloqueo para `frontend`, sin cambios en el servicio:

```bash
MEF_SEED=1 npm run dev -w packages/service      # PowerShell: $env:MEF_SEED=1; npm run dev -w packages/service
GET http://localhost:3000/v1/planeacion-ajuste/PROP-001   # o ACT-001
```

Ambos `ref` devuelven la misma propuesta en `estado: "borrador"`. El `diff` del
seed trae dos entradas reales (`agregar` y `mantener`) en vez del `[]` que pedía
la petición — preferible para ejercitar el diff-viewer.

Sin auth implementada, en dev no hace falta ningún header.

**Nota:** que `PROP-001` y `ACT-001` sirvan indistintamente es la ambigüedad de
`ref` registrada en ADR-001. Acá resulta cómoda, pero sigue sin documentarse en
`openapi.yaml`, que sólo declara `actividadId`.

---

## ADR-003 — Ronda 3: primera ronda sin necesidades nuevas

**Fecha:** 2026-09-01

### Contexto

Con el fixture resuelto en ADR-002 y sin cambios en el servicio, se pidió a
`frontend` verificar si le quedaba alguna necesidad de contrato distinta de las
tres ya abiertas (stack, worker, pseudonimización).

### Decisión

`frontend` verificó `openapi.yaml` contra lo que necesita para el diff-viewer y
las acciones aprobar/descartar, y respondió **"sin necesidades nuevas"**.

Confirmó que la taxonomía de errores de `SPEC.md` §16.1 y el `409
ESTADO_INVALIDO` le alcanzan para el manejo de estados en la UI: deshabilitar las
acciones cuando la propuesta ya no está en `borrador`, y mostrar
`ErrorResponse.error.message` ante 404/409.

### Consecuencia

Primera de las dos rondas consecutivas que exige el criterio de parada.

Se registra una limitación de datos, no de contrato: no existe forma de obtener
una propuesta en `estado: "borrador"` **con `diff: []`**. Aprobar con
`{ "diff": [] }` produce el diff vacío pero deja la propuesta en `aprobado`.
Sirve para probar el render del diff-viewer, no la combinación borrador + diff
vacío. No se agregó nada para cubrirlo: es un caso de datos de prueba, y el
worker real lo va a producir o no según su propia lógica.

---

## ADR-004 — Ronda 4: cierre del ciclo

**Fecha:** 2026-09-01

### Contexto

`packages/service` no cambió desde la ronda 1 (`git status` limpio sobre
`189bc97`), así que repetir la revisión de `backend` habría devuelto el mismo
reporte palabra por palabra. Repetirle a `frontend` la misma pregunta sobre el
mismo contrato habría cumplido el criterio de parada sin verificar nada.

### Decisión

Se corrió una ronda asimétrica: **sin `backend`**, y apuntando a `frontend` al
lado del contrato que no había revisado en detalle — el flujo de captura y
polling, en vez del diff-viewer de la ronda 3.

Preguntas concretas: si `ResultadoActividadInput` alcanza para el formulario, de
dónde saca la UI la lista de alumnos del grupo y sus alias, si `JobProgreso`
alcanza para el contador "18/30 completados" y la recuperación por `jobId` de
`SPEC.md` §5.4, y si la forma única de error alcanza para el manejo de errores.

Respuesta: **"sin necesidades nuevas"**.

### Consecuencia

Segunda ronda consecutiva sin necesidad nueva. **El ciclo se detiene.**

`frontend` confirmó que el shape de captura, el `JobProgreso` (con `total`
contando presentes únicamente, consistente con excluir al ausente) y el
`ErrorResponse` de §16.1 le alcanzan sin ambigüedad.

Un hallazgo que confirma una desviación ya registrada, sin ser nueva: **no hay
ningún endpoint que liste los alumnos de un grupo con sus alias.** La UI no tiene
de dónde sacar `A-01..A-12` para armar el formulario de captura. `frontend` lo
clasificó correctamente como la misma pregunta de pseudonimización de ADR-001 y
no como un hueco adicional: quién produce esos alias depende de si MEF tokeniza
(SPEC §3) o los recibe ya hechos.

### Estado al cerrar el ciclo

Se produjo un contrato verificado y cero código nuevo en 4 rondas. Las tres
cuestiones abiertas requieren decisión humana y ningún subagente puede
resolverlas:

1. **Stack de la UI** — Angular 1.8 (`packages/ui`) vs isla React
   (`SPEC.md` §2/§13). Bloquea todo componente.
2. **Punto de pseudonimización** — si MEF tokeniza `alumnoId → alias` como pide
   §3, o recibe alias ya hechos como está implementado. Define quién es
   responsable de la PII de menores, y de rebote de dónde saca la UI la lista de
   alumnos.
3. **Middleware de auth** — declarado en `openapi.yaml`, no implementado.
   Bloquea los pasos 2 y 12 de la verificación end-to-end de §15.

Fuera de esas, el siguiente trabajo desbloqueante es el worker: sin él,
`estado: "completado"` es inalcanzable y tres de los cinco componentes de §13 no
tienen datos que mostrar.
