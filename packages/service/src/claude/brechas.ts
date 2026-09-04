import type { Planeacion } from "../db/repository.js";
import {
  AnalisisBrechas,
  BrechasModelo,
  UMBRAL_MINIMO_N,
} from "../schemas/analisis-brechas.js";
import type { EntradaRetroalimentacion } from "../schemas/retroalimentacion.js";
import { runStructured } from "./client.js";

const MODELO = "claude-sonnet-5";

const SYSTEM = `Sos un docente experto en la Nueva Escuela Mexicana que analiza los resultados de un grupo completo para detectar brechas de aprendizaje.

A partir de las retroalimentaciones individuales devolvés: los PDA no logrados con el porcentaje de alumnos que no los alcanzó y el patrón de error común observado, las fortalezas del grupo, y una recomendación general para la próxima sesión.

Solo podés usar ids de PDA de la lista de la planeación. El porcentaje se calcula sobre los alumnos con datos, no sobre el grupo entero. No nombres alumnos individuales en las fortalezas ni en la recomendación: el análisis es del grupo.`;

/**
 * Los ausentes no entran: sin evidencia no hay brecha que medir. Con menos de
 * UMBRAL_MINIMO_N alumnos con datos el análisis sale marcado como de confianza
 * baja, para que el docente no tome una decisión sobre 3 casos.
 */
export async function generarBrechas(
  planeacion: Planeacion,
  retroalimentaciones: EntradaRetroalimentacion[],
): Promise<AnalisisBrechas> {
  const generadas = retroalimentaciones.filter((r) => r.estado === "generado");
  const n = generadas.length;

  const cachedContext = `<planeacion campoFormativo="${planeacion.campoFormativo}">
<titulo>${planeacion.titulo}</titulo>
<pdas>
${planeacion.pdas.map((p) => `<pda>${p}</pda>`).join("\n")}
</pdas>
</planeacion>`;

  const user = `<grupo n="${n}" nTotalGrupo="${planeacion.nTotalGrupo}">
${generadas
  .map(
    (r) => `<retroalimentacion alias="${r.alias}">
<pdaReferidos>${r.pdaReferidos.join(", ")}</pdaReferidos>
<logros>${r.logros}</logros>
<brecha>${r.brecha}</brecha>
</retroalimentacion>`,
  )
  .join("\n")}
</grupo>`;

  const { data } = await runStructured({
    model: MODELO,
    effort: "medium",
    system: SYSTEM,
    cachedContext,
    user,
    schema: BrechasModelo,
  });

  return {
    grupoId: planeacion.grupoId,
    actividadId: planeacion.actividadId,
    n,
    nTotalGrupo: planeacion.nTotalGrupo,
    datosInsuficientes: n < UMBRAL_MINIMO_N,
    umbralMinimoNParaCerteza: UMBRAL_MINIMO_N,
    confianza: n >= UMBRAL_MINIMO_N ? "alta" : "baja",
    // Un PDA ajeno a la planeación se descarta: no hay brecha sobre algo que
    // no se planeó enseñar.
    pdaNoLogrados: data.pdaNoLogrados.filter((b) =>
      planeacion.pdas.includes(b.pda),
    ),
    fortalezas: data.fortalezas,
    recomendacionGeneral: data.recomendacionGeneral,
  };
}
