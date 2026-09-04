import type { Planeacion } from "../db/repository.js";
import {
  Retroalimentacion,
  type RetroalimentacionGenerada,
} from "../schemas/retroalimentacion.js";
import type { ResultadoAlumno } from "../schemas/resultado-alumno.js";
import { runStructured } from "./client.js";
import { FEWSHOT_RETROALIMENTACION } from "./fewshot.js";

const MODELO = "claude-haiku-4-5-20251001";

/** Reglas del skill nem-pda, literales: es el prefijo que se reusa entre alumnos. */
const REGLAS_NEM = `<reglas_nem>
- Campos formativos: Lenguajes; Saberes y Pensamiento Científico; Ética, Naturaleza y Sociedades; De lo Humano y lo Comunitario.
- Un PDA se identifica como <fase>.<campo>.<contenido>.<n> (ej. F3.LEN.02.1). Siempre citar el id.
- Retroalimentación formativa: 1) reconocer lo logrado con evidencia concreta, 2) describir la brecha respecto al PDA, 3) una acción siguiente observable. Sin calificación numérica, sin comparar con otros alumnos.
- Tono: segunda persona, cálido, concreto, máximo 120 palabras.
- Nunca inventar MED: solo los devueltos por la herramienta buscar_med.
</reglas_nem>`;

const SYSTEM = `Sos un docente experto en la Nueva Escuela Mexicana que escribe retroalimentación formativa para un alumno a la vez.

Devolvés: los PDA de la planeación a los que se refiere la evidencia (solo ids de la lista dada), lo logrado, la brecha respecto al PDA, un siguiente paso observable, y el texto final dirigido al alumno en segunda persona, cálido y concreto, de máximo 120 palabras.

No califiques con números, no compares con otros alumnos, no inventes evidencia que no esté en el resultado, no uses ids de PDA fuera de la lista.`;

function armarCachedContext(planeacion: Planeacion): string {
  const ejemplos = FEWSHOT_RETROALIMENTACION.map(
    (e) =>
      `<ejemplo situacion="${e.situacion}" alias="${e.alias}" pda="${e.pda}">${e.retro}</ejemplo>`,
  ).join("\n");
  const pdas = planeacion.pdas.map((p) => `<pda>${p}</pda>`).join("\n");
  return `${REGLAS_NEM}

<ejemplos>
${ejemplos}
</ejemplos>

<planeacion campoFormativo="${planeacion.campoFormativo}">
<titulo>${planeacion.titulo}</titulo>
<pdas>
${pdas}
</pdas>
</planeacion>`;
}

/** Solo alias, criterios y observaciones: nunca nombre ni ningún dato identificable. */
function armarUser(resultado: ResultadoAlumno): string {
  const criterios = [
    `<scoreAgregado>${resultado.scoreAgregado ?? ""}</scoreAgregado>`,
    ...(resultado.adecuacionCurricular
      ? [
          `<adecuacionCurricular>${resultado.adecuacionCurricular.criterioAjustado}</adecuacionCurricular>`,
        ]
      : []),
  ].join("\n");
  const observaciones = (resultado.flags ?? [])
    .map((f) => `<observacion tipo="${f.tipo}">${f.nota ?? ""}</observacion>`)
    .join("\n");
  return `<resultado>
<alias>${resultado.alias}</alias>
<criterios>
${criterios}
</criterios>
<observaciones>
${observaciones}
</observaciones>
</resultado>`;
}

/**
 * Un PDA inventado por el modelo no es un detalle de estilo: la retro citaría
 * un aprendizaje que la planeación no cubre. Se reintenta una vez con el error
 * como feedback y, si insiste, el alumno queda marcado para revisión docente.
 */
export async function generarRetro(
  planeacion: Planeacion,
  resultado: ResultadoAlumno,
): Promise<RetroalimentacionGenerada> {
  const cachedContext = armarCachedContext(planeacion);
  const user = armarUser(resultado);
  let feedback = "";

  for (let intento = 0; ; intento++) {
    const { data } = await runStructured({
      model: MODELO,
      effort: "low",
      system: SYSTEM,
      cachedContext,
      user: user + feedback,
      schema: Retroalimentacion,
    });
    const retro = { ...data, alias: resultado.alias };
    const invalidos = retro.pdaReferidos.filter(
      (p) => !planeacion.pdas.includes(p),
    );
    if (invalidos.length === 0)
      return { ...retro, estado: "generado", requiereRevision: false };
    if (intento === 1)
      return { ...retro, estado: "generado", requiereRevision: true };
    feedback = `

<error_intento_anterior>
Estos ids de PDA no existen en la planeación: ${invalidos.join(", ")}.
Usá únicamente ids de la lista <pdas> del contexto.
</error_intento_anterior>`;
  }
}
