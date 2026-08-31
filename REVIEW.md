# Instrucciones de revisión — MEF

Este archivo lo leen el job `review` de CI, el subagente `reviewer`, `/code-review` y `/ultrareview`.

## Qué es Important (bloquea el merge)
- Dato identificable de alumno (nombre, CURP, correo, teléfono) en prompts, fixtures, logs, tests o `llm_usage`. Solo alias `A-NN`.
- Llamada a Claude sin structured output o sin validación en código de la salida (PDA citado inexistente, id de MED no devuelto por `buscar_med`).
- Dato externo (MED, observaciones, evidencias) que llega al modelo sin envoltura `<dato_externo>` ni instrucción de no seguir instrucciones.
- Opus en código de producto; bucle agéntico sin tope de iteraciones; secretos en el repo.
- Requisito del `SPEC.md` marcado como hecho sin test que lo cubra.

## Qué es Nit (se reporta, no bloquea)
- Violaciones a `CLAUDE.md` (convenciones, nombres de rama, typecheck omitido).
- Dependencias evitables y abstracciones especulativas (criterio ponytail).

## No reportar
- Formato, nombres, estilo: lo cubre prettier y el hook.
- Archivos generados, lockfiles, `reports/`.

## Formato de salida
`archivo:línea — severidad — problema — evidencia — fix sugerido`. Si no hay nada: `OK`. Máximo 5 Nits; el resto como conteo.
