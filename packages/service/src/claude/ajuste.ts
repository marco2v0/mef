import type { Planeacion } from "../db/repository.js";
import {
  AjusteModelo,
  type AjustePlaneacion,
} from "../schemas/ajuste-planeacion.js";
import type { AnalisisBrechas } from "../schemas/analisis-brechas.js";
import { runStructured } from "./client.js";

const MODELO = "claude-sonnet-5";

const SYSTEM = `Sos un docente experto en la Nueva Escuela Mexicana que ajusta la planeación de la siguiente sesión a partir del análisis de brechas del grupo.

Devolvés los cambios a la secuencia didáctica (agregar, modificar o mantener, cada uno con el PDA relacionado) y una actividad remedial concreta con su duración en minutos y el PDA que ataca.

No propongas materiales ni recursos digitales: los MED se agregan aparte, desde el catálogo. Si el análisis es de confianza baja, proponé cambios conservadores y priorizá recolectar más evidencia.`;

/**
 * La propuesta nace en borrador: nunca se aplica sola, la aprueba el docente.
 * medSugeridos queda vacío a propósito; se llena con buscar_med (MCP).
 */
export async function generarAjuste(
  planeacion: Planeacion,
  brechas: AnalisisBrechas,
): Promise<AjustePlaneacion> {
  const cachedContext = `<planeacion campoFormativo="${planeacion.campoFormativo}">
<titulo>${planeacion.titulo}</titulo>
<pdas>
${planeacion.pdas.map((p) => `<pda>${p}</pda>`).join("\n")}
</pdas>
</planeacion>`;

  const user = `<brechas n="${brechas.n}" nTotalGrupo="${brechas.nTotalGrupo}" confianza="${brechas.confianza}" datosInsuficientes="${brechas.datosInsuficientes}">
${brechas.pdaNoLogrados
  .map(
    (b) =>
      `<pdaNoLogrado pda="${b.pda}" porcentaje="${b.porcentaje}">${b.patron}</pdaNoLogrado>`,
  )
  .join("\n")}
<fortalezas>
${brechas.fortalezas.map((f) => `<fortaleza>${f}</fortaleza>`).join("\n")}
</fortalezas>
<recomendacionGeneral>${brechas.recomendacionGeneral}</recomendacionGeneral>
</brechas>`;

  const { data } = await runStructured({
    model: MODELO,
    effort: "high",
    system: SYSTEM,
    cachedContext,
    user,
    schema: AjusteModelo,
  });

  return {
    id: crypto.randomUUID(),
    planeacionId: planeacion.planeacionId,
    actividadId: planeacion.actividadId,
    estado: "borrador",
    cambiosSecuencia: data.cambiosSecuencia,
    actividadRemedial: data.actividadRemedial,
    medSugeridos: [],
    auditoria: {
      creadoEn: new Date().toISOString(),
      editadoRespectoOriginal: false,
    },
  };
}
