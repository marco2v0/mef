import { generarAjuste } from "./claude/ajuste.js";
import { generarBrechas } from "./claude/brechas.js";
import { generarRetro } from "./claude/retroalimentacion.js";
import type { Repository } from "./db/repository.js";
import type { JobProgreso } from "./schemas/job.js";
import type { ResultadoActividadInput } from "./schemas/resultado-alumno.js";

const CONCURRENCIA = 4;

/**
 * Worker del job creado en POST /v1/retroalimentacion. Corre fuera del
 * request: cada alumno terminado se persiste, así el polling ve avance real.
 * Un alumno que falla no cancela el lote: queda en requierenRevision.
 */
export async function procesarJob(
  repo: Repository,
  job: JobProgreso,
  input: ResultadoActividadInput,
): Promise<void> {
  const planeacion = await repo.getPlaneacion(input.planeacionId);
  if (!planeacion) {
    await repo.updateJob({ ...job, estado: "error" });
    return;
  }

  const presentes = input.resultados.filter((r) => r.presente);
  // Los ausentes se listan desde el arranque con estado sinDatos: el docente
  // los ve en la respuesta, pero nunca se los manda a Claude ni se les inventa
  // un texto sin evidencia.
  const sinDatos = input.resultados
    .filter((r) => !r.presente)
    .map((r) => ({ alias: r.alias, estado: "sinDatos" as const }));
  // Estado compartido por los 4 corredores: JS no interleava dentro de un
  // bloque sincrónico, así que el reemplazo completo no pierde avances.
  let progreso: JobProgreso = {
    ...job,
    estado: "procesando",
    total: presentes.length,
    retroalimentaciones: [...(job.retroalimentaciones ?? []), ...sinDatos],
  };
  await repo.updateJob(progreso);

  let siguiente = 0;
  const correr = async () => {
    while (siguiente < presentes.length) {
      const resultado = presentes[siguiente++]!;
      const retro = await generarRetro(planeacion, resultado).catch(
        (err: unknown) => {
          console.error({ jobId: job.jobId, alias: resultado.alias, err });
          return null;
        },
      );
      progreso = {
        ...progreso,
        completados: progreso.completados + 1,
        retroalimentaciones: [
          ...(progreso.retroalimentaciones ?? []),
          ...(retro ? [retro] : []),
        ],
        requierenRevision:
          retro && !retro.requiereRevision
            ? progreso.requierenRevision
            : [...progreso.requierenRevision, resultado.alias],
      };
      await repo.updateJob(progreso);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCIA }, correr));

  // Cerrado el lote por alumno, el análisis de grupo y el ajuste. Si fallan,
  // las retroalimentaciones ya generadas siguen siendo válidas: el job cierra
  // completado igual y el docente las ve sin brechas ni propuesta.
  try {
    const brechas = await generarBrechas(
      planeacion,
      progreso.retroalimentaciones ?? [],
    );
    progreso = { ...progreso, brechas };
    await repo.updateJob(progreso);

    const ajuste = await generarAjuste(planeacion, brechas);
    // Una propuesta ya aprobada por el docente no se pisa con una nueva:
    // queda solo en el job, para que él decida.
    const vigente = await repo.getPropuesta(planeacion.actividadId);
    if (vigente?.estado !== "aprobado") await repo.savePropuesta(ajuste);
    progreso = { ...progreso, ajuste };
  } catch (err: unknown) {
    console.error({ jobId: job.jobId, etapa: "brechas/ajuste", err });
  }

  await repo.updateJob({ ...progreso, estado: "completado" });
}
