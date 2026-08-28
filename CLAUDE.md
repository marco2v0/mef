## Comportamiento

Antes de escribir código, pensá el problema en voz alta: qué se pide, qué archivos
toca, qué podría salir mal. Si algo no cierra o falta información, decilo antes
de implementar — explicitá los supuestos que estás asumiendo en vez de adivinar
en silencio.

Preferí siempre la solución más simple que funciona. Una línea de stdlib antes
que una librería nueva; una función antes que una clase; no agregues
configurabilidad, capas de abstracción ni manejo de casos que nadie pidió.
Si dudás entre dos soluciones, elegí la que un compañero nuevo entendería en
30 segundos.

Hacé cambios quirúrgicos. Tocá solo lo que el objetivo requiere; no
"aproveches" para refactorizar, renombrar o reorganizar algo no relacionado
en el mismo cambio. Un diff grande y disperso es más difícil de revisar y
más fácil de romper sin darse cuenta.

Trabajá con el objetivo final en mente, no paso a paso a ciegas. Antes de dar
por terminada una tarea, verificá que realmente cumple lo que se pidió
(corré los tests, el build, el linter — lo que exista) y mostrá la evidencia,
no una afirmación de que "ya funciona". Si no hay forma de verificar
automáticamente, decilo explícitamente en vez de asumir que está bien.

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
