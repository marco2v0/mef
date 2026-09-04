import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { fail } from "../errors.js";
import {
  AprobarBody,
  type AjustePlaneacion,
} from "../schemas/ajuste-planeacion.js";

export const planeacionAjusteRoutes = new Hono<AppEnv>();

/** GET /v1/planeacion-ajuste/{actividadId} */
planeacionAjusteRoutes.get("/:ref", async (c) => {
  const propuesta = await c.get("repo").getPropuesta(c.req.param("ref"));
  if (!propuesta)
    return fail(
      c,
      404,
      "NO_ENCONTRADO",
      "No hay propuesta para esa actividad.",
    );
  return c.json(propuesta);
});

/**
 * POST /v1/planeacion-ajuste/{id}/aprobar — nunca se auto-aplica: la aprueba
 * el docente. El body opcional trae sus ediciones sobre la secuencia; si difieren
 * del original, queda registrado en editadoRespectoOriginal (SPEC §10).
 */
planeacionAjusteRoutes.post("/:id/aprobar", async (c) => {
  const repo = c.get("repo");
  const propuesta = await repo.getPropuesta(c.req.param("id"));
  if (!propuesta)
    return fail(c, 404, "NO_ENCONTRADO", "No existe la propuesta indicada.");
  if (propuesta.estado !== "borrador" && propuesta.estado !== "revisado") {
    return fail(
      c,
      409,
      "ESTADO_INVALIDO",
      `La propuesta ya está ${propuesta.estado}.`,
    );
  }

  const crudo = await c.req.text();
  const { cambiosSecuencia: editados, medSugeridos } = crudo
    ? AprobarBody.parse(JSON.parse(crudo))
    : {};
  const cambio = (editado: unknown, original: unknown) =>
    editado !== undefined &&
    JSON.stringify(editado) !== JSON.stringify(original);
  const editado =
    cambio(editados, propuesta.cambiosSecuencia) ||
    cambio(medSugeridos, propuesta.medSugeridos);

  const aprobada: AjustePlaneacion = {
    ...propuesta,
    cambiosSecuencia: editados ?? propuesta.cambiosSecuencia,
    medSugeridos: medSugeridos ?? propuesta.medSugeridos,
    estado: "aprobado",
    auditoria: {
      ...propuesta.auditoria,
      // STUB: aprobadoPor sale del claim docenteId del JWT (falta middleware de auth).
      aprobadoEn: new Date().toISOString(),
      editadoRespectoOriginal: editado,
    },
  };
  await repo.savePropuesta(aprobada);
  return c.json(aprobada);
});

/** POST /v1/planeacion-ajuste/{id}/descartar */
planeacionAjusteRoutes.post("/:id/descartar", async (c) => {
  const repo = c.get("repo");
  const propuesta = await repo.getPropuesta(c.req.param("id"));
  if (!propuesta)
    return fail(c, 404, "NO_ENCONTRADO", "No existe la propuesta indicada.");
  if (propuesta.estado !== "borrador" && propuesta.estado !== "revisado") {
    return fail(
      c,
      409,
      "ESTADO_INVALIDO",
      `La propuesta ya está ${propuesta.estado}.`,
    );
  }
  const descartada: AjustePlaneacion = { ...propuesta, estado: "descartado" };
  await repo.savePropuesta(descartada);
  return c.json(descartada);
});
