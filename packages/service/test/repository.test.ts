import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PLANEACION_MOCK, PROPUESTA_MOCK } from "../src/db/seed.js";
import { SqliteRepository } from "../src/db/sqlite.js";
import type { ResultadoActividadInput } from "../src/schemas/index.js";

let repo: SqliteRepository;

beforeEach(() => {
  repo = new SqliteRepository();
  repo.seedParaDesarrollo();
});

afterEach(() => {
  repo.close();
});

async function inputDesdeSeed(): Promise<ResultadoActividadInput> {
  return {
    planeacionId: PLANEACION_MOCK.planeacionId,
    actividadId: PLANEACION_MOCK.actividadId,
    grupoId: PLANEACION_MOCK.grupoId,
    cicloEscolarId: PLANEACION_MOCK.cicloEscolarId,
    resultados: await repo.getResultados(PLANEACION_MOCK.planeacionId),
  };
}

describe("getPlaneacion", () => {
  it("devuelve la planeación sembrada", async () => {
    expect(await repo.getPlaneacion("PLAN-001")).toEqual(PLANEACION_MOCK);
  });

  it("devuelve null para un id inexistente, sin lanzar", async () => {
    expect(await repo.getPlaneacion("PLAN-INEXISTENTE")).toBeNull();
  });
});

describe("getResultados", () => {
  it("devuelve 12 alias únicos con formato A-NN", async () => {
    const resultados = await repo.getResultados("PLAN-001");
    const alias = resultados.map((r) => r.alias);
    expect(alias).toHaveLength(12);
    expect(new Set(alias).size).toBe(12);
    for (const a of alias) expect(a).toMatch(/^A-\d{2}$/);
  });

  it("marca a A-07 ausente y sin scoreAgregado", async () => {
    const resultados = await repo.getResultados("PLAN-001");
    const ausente = resultados.find((r) => r.alias === "A-07");
    expect(ausente?.presente).toBe(false);
    expect(ausente).not.toHaveProperty("scoreAgregado");
  });

  it("expone la adecuación curricular de A-11", async () => {
    const resultados = await repo.getResultados("PLAN-001");
    const conAdecuacion = resultados.find((r) => r.alias === "A-11");
    expect(conAdecuacion?.adecuacionCurricular?.criterioAjustado).toBeTruthy();
  });

  it("no expone ningún dato identificable de alumnos", async () => {
    const resultados = await repo.getResultados("PLAN-001");
    const claves = new Set(resultados.flatMap((r) => Object.keys(r)));
    for (const prohibida of ["alumnoId", "nombre", "curp", "correo", "email"]) {
      expect(claves).not.toContain(prohibida);
    }
    expect(JSON.stringify(resultados)).not.toMatch(/curp|nombre|correo/i);
  });

  it("devuelve arreglo vacío para una planeación inexistente", async () => {
    expect(await repo.getResultados("PLAN-INEXISTENTE")).toEqual([]);
  });
});

describe("propuestas", () => {
  it("hace round-trip por id y por actividadId", async () => {
    expect(await repo.getPropuesta(PROPUESTA_MOCK.id)).toEqual(PROPUESTA_MOCK);
    expect(await repo.getPropuesta(PROPUESTA_MOCK.actividadId)).toEqual(
      PROPUESTA_MOCK,
    );
  });

  it("un segundo save del mismo id actualiza en vez de duplicar", async () => {
    await repo.savePropuesta({ ...PROPUESTA_MOCK, estado: "aprobado" });
    const propuesta = await repo.getPropuesta(PROPUESTA_MOCK.id);
    expect(propuesta?.estado).toBe("aprobado");
    expect(await repo.getPropuesta(PROPUESTA_MOCK.actividadId)).toEqual(
      propuesta,
    );
  });

  it("devuelve null si no hay propuesta", async () => {
    expect(await repo.getPropuesta("ACT-INEXISTENTE")).toBeNull();
  });

  it("rechaza una segunda propuesta para la misma actividad", async () => {
    await expect(
      repo.savePropuesta({ ...PROPUESTA_MOCK, id: "PROP-002" }),
    ).rejects.toThrow(/UNIQUE/i);
  });
});

describe("jobs", () => {
  it("createJob cuenta solo a los presentes y arranca encolado", async () => {
    const job = await repo.createJob(await inputDesdeSeed());
    expect(job.estado).toBe("encolado");
    expect(job.total).toBe(11); // 12 alumnos menos A-07, ausente
    expect(job.completados).toBe(0);
    expect(job.requierenRevision).toEqual([]);
  });

  it("getJob devuelve null para un jobId inexistente", async () => {
    expect(await repo.getJob("no-existe")).toBeNull();
  });

  it("updateJob persiste el progreso y getJob lo recupera", async () => {
    const job = await repo.createJob(await inputDesdeSeed());
    const enProgreso = {
      ...job,
      estado: "procesando" as const,
      completados: 6,
      requierenRevision: ["A-08"],
    };
    await repo.updateJob(enProgreso);
    expect(await repo.getJob(job.jobId)).toEqual(enProgreso);
  });

  it("updateJob falla si el job no existe, en vez de perder la escritura", async () => {
    await expect(
      repo.updateJob({
        jobId: "no-existe",
        estado: "procesando",
        total: 1,
        completados: 0,
        requierenRevision: [],
      }),
    ).rejects.toThrow(/no existe el job/);
  });
});

describe("seed", () => {
  it("el constructor no siembra: una base nueva arranca vacía", async () => {
    const limpia = new SqliteRepository();
    try {
      expect(
        await limpia.getPlaneacion(PLANEACION_MOCK.planeacionId),
      ).toBeNull();
      expect(await limpia.getResultados(PLANEACION_MOCK.planeacionId)).toEqual(
        [],
      );
      expect(await limpia.getPropuesta(PROPUESTA_MOCK.actividadId)).toBeNull();
    } finally {
      limpia.close();
    }
  });
});
