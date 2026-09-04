## Comportamiento

**1. Pensá antes de codear.** No asumas ni escondas confusión: explicitá supuestos; si hay varias interpretaciones, presentalas — no elijas en silencio; si existe un camino más simple, decilo; si algo no está claro, frená y preguntá.

**2. Simplicidad primero.** El mínimo código que resuelve el problema. Nada especulativo: sin features no pedidas, sin abstracciones para código de un solo uso, sin "flexibilidad" que nadie pidió, sin manejar errores imposibles. Si escribiste 200 líneas y podían ser 50, reescribí.

**3. Cambios quirúrgicos.** Tocá solo lo necesario: no "mejores" código adyacente, no refactorices lo que no está roto, respetá el estilo existente. Limpiá únicamente los huérfanos que TUS cambios crearon. Prueba: cada línea cambiada se rastrea directo al pedido.

**4. Ejecución guiada por objetivo.** Transformá la tarea en un criterio verificable ("arreglá el bug" → "test que lo reproduce, luego hacelo pasar") y para tareas multi-paso, plan breve con `paso → verificación`. Iterá hasta que la verificación pase.

# MEF · MentorIA Evaluación Formativa

## Comandos

- Instalar: `npm install` (workspaces)
- Tests unitarios: `npm test -w packages/service` (Vitest; correr tests individuales, no toda la suite)
- Evals: `npm run evals -w packages/evals`
- Typecheck: `npm run typecheck` — SIEMPRE antes de dar por terminada una serie de cambios

## Reglas duras

- NUNCA enviar al modelo nombre, CURP, correo ni dato identificable de alumnos. Solo alias `A-NN`.
- Toda llamada a Claude usa structured outputs con un schema en `packages/service/src/schemas/`.
- El servicio NO accede a la base de datos de Red Magisterial: todo entra por `packages/service/src/db/repository.ts` (interfaz).
- Modelos: Haiku 4.5 para retroalimentación por alumno; Sonnet 5 para brechas y ajuste. Nunca Opus en producto.

## Convenciones

- ES modules, TypeScript estricto, sin `any`.
- Ramas `feat/<tema>`, commits en español imperativo, PR con sección "Cómo verificar".
- Dominio NEM/PDA: ver skill `nem-pda` (no repetir aquí).
