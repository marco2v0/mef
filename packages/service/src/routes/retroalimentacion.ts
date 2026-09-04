import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { fail } from "../errors.js";
import { Alias, ResultadoActividadInput } from "../schemas/index.js";
import { procesarJob } from "../worker.js";

export const retroalimentacionRoutes = new Hono<AppEnv>();

/** POST /v1/retroalimentacion — encola el lote y responde de inmediato. */
retroalimentacionRoutes.post("/", async (c) => {
  const input = ResultadoActividadInput.parse(await c.req.json());
  const repo = c.get("repo");
  const job = await repo.createJob(input);
  // Sin await a propósito: el docente recibe el jobId ya y sigue el avance por
  // GET. procesarJob persiste su propio estado, incluso al fallar.
  void procesarJob(repo, job, input).catch((err: unknown) => {
    console.error({ jobId: job.jobId, err });
  });
  return c.json({ jobId: job.jobId, estado: job.estado }, 202);
});

/** GET /v1/retroalimentacion/{jobId} — progreso para el polling de la isla React. */
retroalimentacionRoutes.get("/:jobId", async (c) => {
  const job = await c.get("repo").getJob(c.req.param("jobId"));
  if (!job)
    return fail(c, 404, "NO_ENCONTRADO", "El job solicitado no existe.");
  // STUB: falta AnalisisBrechas; las retroalimentaciones ya vienen en el job.
  return c.json(job);
});

/** POST /v1/retroalimentacion/{jobId}/alumnos/{alias}/reintentar */
retroalimentacionRoutes.post("/:jobId/alumnos/:alias/reintentar", async (c) => {
  const repo = c.get("repo");
  const alias = Alias.parse(c.req.param("alias"));
  const job = await repo.getJob(c.req.param("jobId"));
  if (!job)
    return fail(c, 404, "NO_ENCONTRADO", "El job solicitado no existe.");
  if (!job.requierenRevision.includes(alias)) {
    return fail(
      c,
      404,
      "NO_ENCONTRADO",
      "Ese alumno no está marcado para revisión en este job.",
    );
  }
  const actualizado = {
    ...job,
    estado: "procesando" as const,
    requierenRevision: job.requierenRevision.filter((a) => a !== alias),
  };
  await repo.updateJob(actualizado);
  // STUB: falta reencolar a ese alumno en el worker.
  return c.json(actualizado, 202);
});
