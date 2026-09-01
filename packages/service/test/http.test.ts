import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppEnv } from "../src/app.js";
import { createApp } from "../src/app.js";
import { PLANEACION_MOCK, PROPUESTA_MOCK } from "../src/db/seed.js";
import { SqliteRepository } from "../src/db/sqlite.js";
import type {
  AjustePlaneacion,
  ResultadoActividadInput,
} from "../src/schemas/index.js";

let repo: SqliteRepository;
let app: Hono<AppEnv>;

beforeEach(() => {
  repo = new SqliteRepository();
  repo.seedParaDesarrollo();
  app = createApp(repo);
});

afterEach(() => {
  repo.close();
});

function post(ruta: string, body?: string) {
  return app.request(ruta, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body }),
  });
}

async function inputValido(): Promise<ResultadoActividadInput> {
  return {
    planeacionId: PLANEACION_MOCK.planeacionId,
    actividadId: PLANEACION_MOCK.actividadId,
    grupoId: PLANEACION_MOCK.grupoId,
    cicloEscolarId: PLANEACION_MOCK.cicloEscolarId,
    resultados: await repo.getResultados(PLANEACION_MOCK.planeacionId),
  };
}

describe("POST /v1/retroalimentacion", () => {
  it("encola el lote y responde 202", async () => {
    const res = await post(
      "/v1/retroalimentacion",
      JSON.stringify(await inputValido()),
    );
    expect(res.status).toBe(202);
    const cuerpo = (await res.json()) as { jobId: string; estado: string };
    expect(cuerpo.estado).toBe("encolado");
    expect(await repo.getJob(cuerpo.jobId)).not.toBeNull();
  });

  it("responde 400 con JSON malformado, no 500", async () => {
    const res = await post("/v1/retroalimentacion", "{no-json");
    expect(res.status).toBe(400);
    const cuerpo = (await res.json()) as {
      error: { code: string; requestId: string };
    };
    expect(cuerpo.error.code).toBe("INPUT_INVALIDO");
    expect(cuerpo.error.requestId).toBeTruthy();
  });

  it("responde 400 con body vacío, no 500", async () => {
    const res = await post("/v1/retroalimentacion");
    expect(res.status).toBe(400);
  });

  it("responde 400 si un alumno presente no trae scoreAgregado", async () => {
    const invalido = {
      ...(await inputValido()),
      resultados: [{ alias: "A-01", presente: true }],
    };
    const res = await post("/v1/retroalimentacion", JSON.stringify(invalido));
    expect(res.status).toBe(400);
  });

  it("nunca filtra detalle interno en el mensaje de error", async () => {
    const res = await post("/v1/retroalimentacion", "{no-json");
    const cuerpo = (await res.json()) as { error: { message: string } };
    expect(cuerpo.error.message).not.toMatch(
      /JSON|SyntaxError|token|at position/i,
    );
  });
});

describe("GET /v1/retroalimentacion/{jobId}", () => {
  it("recupera el progreso de un job existente", async () => {
    const creado = (await (
      await post("/v1/retroalimentacion", JSON.stringify(await inputValido()))
    ).json()) as { jobId: string };
    const res = await app.request(`/v1/retroalimentacion/${creado.jobId}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as { total: number }).toMatchObject({
      total: 11,
      completados: 0,
    });
  });

  it("responde 404 para un jobId inexistente", async () => {
    const res = await app.request("/v1/retroalimentacion/no-existe");
    expect(res.status).toBe(404);
  });
});

describe("POST /v1/retroalimentacion/{jobId}/alumnos/{alias}/reintentar", () => {
  async function jobConRevision(aliases: string[]) {
    const job = await repo.createJob(await inputValido());
    await repo.updateJob({
      ...job,
      estado: "error",
      requierenRevision: aliases,
    });
    return job.jobId;
  }

  it("saca al alumno de requierenRevision", async () => {
    const jobId = await jobConRevision(["A-08", "A-09"]);
    const res = await post(
      `/v1/retroalimentacion/${jobId}/alumnos/A-08/reintentar`,
    );
    expect(res.status).toBe(202);
    expect((await repo.getJob(jobId))?.requierenRevision).toEqual(["A-09"]);
  });

  it("responde 400 si el alias no tiene forma A-NN", async () => {
    const jobId = await jobConRevision(["A-08"]);
    const res = await post(
      `/v1/retroalimentacion/${jobId}/alumnos/Juan/reintentar`,
    );
    expect(res.status).toBe(400);
  });

  it("responde 404 si ese alumno no está marcado para revisión", async () => {
    const jobId = await jobConRevision(["A-08"]);
    const res = await post(
      `/v1/retroalimentacion/${jobId}/alumnos/A-09/reintentar`,
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /v1/planeacion-ajuste/{actividadId}", () => {
  it("devuelve la propuesta por actividadId y por id", async () => {
    for (const ref of [PROPUESTA_MOCK.actividadId, PROPUESTA_MOCK.id]) {
      const res = await app.request(`/v1/planeacion-ajuste/${ref}`);
      expect(res.status).toBe(200);
      expect((await res.json()) as AjustePlaneacion).toEqual(PROPUESTA_MOCK);
    }
  });

  it("responde 404 si no hay propuesta", async () => {
    expect((await app.request("/v1/planeacion-ajuste/ACT-999")).status).toBe(
      404,
    );
  });
});

describe("POST /v1/planeacion-ajuste/{id}/aprobar", () => {
  it("sin body aprueba tal cual y deja editadoRespectoOriginal en false", async () => {
    const res = await post(
      `/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/aprobar`,
    );
    expect(res.status).toBe(200);
    const propuesta = (await res.json()) as AjustePlaneacion;
    expect(propuesta.estado).toBe("aprobado");
    expect(propuesta.auditoria.editadoRespectoOriginal).toBe(false);
    expect(propuesta.auditoria.aprobadoEn).toBeTruthy();
    expect(propuesta.diff).toEqual(PROPUESTA_MOCK.diff);
  });

  it("aplica el diff editado y marca editadoRespectoOriginal", async () => {
    const diffEditado = [
      { tipo: "modificar", descripcion: "Remedial de 30 min en vez de 20" },
    ];
    const res = await post(
      `/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/aprobar`,
      JSON.stringify({ diff: diffEditado }),
    );
    expect(res.status).toBe(200);
    const propuesta = (await res.json()) as AjustePlaneacion;
    expect(propuesta.diff).toEqual(diffEditado);
    expect(propuesta.auditoria.editadoRespectoOriginal).toBe(true);
    expect((await repo.getPropuesta(PROPUESTA_MOCK.id))?.diff).toEqual(
      diffEditado,
    );
  });

  it("un diff idéntico al original no cuenta como edición", async () => {
    const res = await post(
      `/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/aprobar`,
      JSON.stringify({ diff: PROPUESTA_MOCK.diff }),
    );
    const propuesta = (await res.json()) as AjustePlaneacion;
    expect(propuesta.auditoria.editadoRespectoOriginal).toBe(false);
  });

  it("rechaza un medSugerido que no venga de buscar_med", async () => {
    const res = await post(
      `/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/aprobar`,
      JSON.stringify({
        diff: [
          {
            tipo: "agregar",
            descripcion: "Video inventado",
            medSugerido: { medId: "MED-9", titulo: "Falso", fuente: "modelo" },
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("responde 404 si la propuesta no existe", async () => {
    expect((await post("/v1/planeacion-ajuste/PROP-999/aprobar")).status).toBe(
      404,
    );
  });

  it("responde 409 al re-aprobar y conserva el aprobadoEn original", async () => {
    const primera = (await (
      await post(`/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/aprobar`)
    ).json()) as AjustePlaneacion;
    const segunda = await post(
      `/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/aprobar`,
    );
    expect(segunda.status).toBe(409);
    expect(
      (await repo.getPropuesta(PROPUESTA_MOCK.id))?.auditoria.aprobadoEn,
    ).toBe(primera.auditoria.aprobadoEn);
  });

  it("responde 409 al aprobar una propuesta descartada", async () => {
    await post(`/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/descartar`);
    const res = await post(
      `/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/aprobar`,
    );
    expect(res.status).toBe(409);
    expect((await repo.getPropuesta(PROPUESTA_MOCK.id))?.estado).toBe(
      "descartado",
    );
  });
});

describe("POST /v1/planeacion-ajuste/{id}/descartar", () => {
  it("descarta una propuesta abierta", async () => {
    const res = await post(
      `/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/descartar`,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as AjustePlaneacion).estado).toBe("descartado");
  });

  it("responde 409 al descartar una ya aprobada", async () => {
    await post(`/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/aprobar`);
    expect(
      (await post(`/v1/planeacion-ajuste/${PROPUESTA_MOCK.id}/descartar`))
        .status,
    ).toBe(409);
  });
});

describe("varios", () => {
  it("GET /v1/health responde ok sin auth", async () => {
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estado: "ok" });
  });

  it("una ruta inexistente responde 404 con la forma de error única", async () => {
    const res = await app.request("/v1/no-existe");
    expect(res.status).toBe(404);
    const cuerpo = (await res.json()) as {
      error: { code: string; requestId: string };
    };
    expect(cuerpo.error.code).toBe("NO_ENCONTRADO");
    expect(cuerpo.error.requestId).toBeTruthy();
  });
});
