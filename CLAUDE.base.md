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
