import { describe, expect, it } from "vitest";
import {
  AjustePlaneacion,
  AnalisisBrechas,
  JobProgreso,
  Retroalimentacion,
  ResultadoAlumno,
} from "../src/schemas/index.js";

describe("ResultadoAlumno", () => {
  it("acepta un alumno presente con score", () => {
    expect(
      ResultadoAlumno.safeParse({
        alias: "A-01",
        presente: true,
        scoreAgregado: 85,
      }).success,
    ).toBe(true);
  });

  it("rechaza presente sin scoreAgregado", () => {
    const r = ResultadoAlumno.safeParse({ alias: "A-01", presente: true });
    expect(r.success).toBe(false);
  });

  it("acepta ausente sin scoreAgregado", () => {
    expect(
      ResultadoAlumno.safeParse({ alias: "A-07", presente: false }).success,
    ).toBe(true);
  });

  it("rechaza alias mal formados o identificables", () => {
    expect(
      ResultadoAlumno.safeParse({ alias: "A-1", presente: false }).success,
    ).toBe(false);
    expect(
      ResultadoAlumno.safeParse({ alias: "Juan", presente: false }).success,
    ).toBe(false);
  });
});

describe("Retroalimentacion", () => {
  it("acepta sinDatos sin texto", () => {
    expect(
      Retroalimentacion.safeParse({
        alias: "A-07",
        estado: "sinDatos",
        adecuacionAplicada: false,
        intentos: 0,
      }).success,
    ).toBe(true);
  });

  it("rechaza un nivel de PDA fuera del enum", () => {
    expect(
      Retroalimentacion.safeParse({
        alias: "A-01",
        estado: "generado",
        retroalimentacion: "Buen avance en la lectura.",
        pdaInferidos: [{ pda: "F3.LEN.02.1", nivel: "casiLogrado" }],
        adecuacionAplicada: false,
        intentos: 1,
      }).success,
    ).toBe(false);
  });
});

describe("AnalisisBrechas", () => {
  const base = {
    grupoId: "GRP-001",
    actividadId: "ACT-001",
    n: 11,
    nTotalGrupo: 12,
    datosInsuficientes: false,
    umbralMinimoNParaCerteza: 8,
    brechas: [
      { pda: "F3.LEN.02.1", porcentajeNoLogrado: 36.4, confianza: "alta" },
    ],
  };

  it("acepta un análisis válido", () => {
    expect(AnalisisBrechas.safeParse(base).success).toBe(true);
  });

  it("rechaza porcentajeNoLogrado fuera de 0..100", () => {
    const fuera = {
      ...base,
      brechas: [
        { pda: "F3.LEN.02.1", porcentajeNoLogrado: 140, confianza: "alta" },
      ],
    };
    expect(AnalisisBrechas.safeParse(fuera).success).toBe(false);
  });

  it("rechaza una confianza fuera de alta|baja", () => {
    const rara = {
      ...base,
      brechas: [
        { pda: "F3.LEN.02.1", porcentajeNoLogrado: 36.4, confianza: "media" },
      ],
    };
    expect(AnalisisBrechas.safeParse(rara).success).toBe(false);
  });

  it("acepta flagsSospecha con alcance grupoCompleto", () => {
    const conFlag = {
      ...base,
      flagsSospecha: [
        {
          alumnos: ["A-05", "A-12"],
          alcance: "grupoCompleto",
          nota: "Respuestas idénticas en todo el grupo",
        },
      ],
    };
    expect(AnalisisBrechas.safeParse(conFlag).success).toBe(true);
  });
});

describe("AjustePlaneacion", () => {
  const base = {
    id: "PROP-001",
    planeacionId: "PLAN-001",
    actividadId: "ACT-001",
    estado: "borrador",
    diff: [{ tipo: "agregar", descripcion: "Actividad remedial de 20 min" }],
    auditoria: {
      creadoEn: "2026-09-01T12:00:00.000Z",
      editadoRespectoOriginal: false,
    },
  };

  it("acepta un diff sin medSugerido", () => {
    expect(AjustePlaneacion.safeParse(base).success).toBe(true);
  });

  it("solo acepta medSugerido con fuente mcp-buscar_med", () => {
    const conMed = (fuente: string) => ({
      ...base,
      diff: [
        {
          tipo: "agregar",
          descripcion: "Actividad remedial de 20 min",
          medSugerido: { medId: "MED-9", titulo: "Lectura guiada", fuente },
        },
      ],
    });
    expect(AjustePlaneacion.safeParse(conMed("mcp-buscar_med")).success).toBe(
      true,
    );
    expect(AjustePlaneacion.safeParse(conMed("modelo")).success).toBe(false);
  });
});

describe("JobProgreso", () => {
  const base = {
    jobId: "job-1",
    estado: "procesando",
    total: 11,
    completados: 6,
    requierenRevision: ["A-08"],
  };

  it("acepta un progreso válido", () => {
    expect(JobProgreso.safeParse(base).success).toBe(true);
  });

  it("rechaza completados mayor que total", () => {
    expect(JobProgreso.safeParse({ ...base, completados: 12 }).success).toBe(
      false,
    );
  });

  it("rechaza un estado fuera del enum", () => {
    expect(JobProgreso.safeParse({ ...base, estado: "pausado" }).success).toBe(
      false,
    );
  });

  it("rechaza aliases identificables en requierenRevision", () => {
    expect(
      JobProgreso.safeParse({ ...base, requierenRevision: ["Juan"] }).success,
    ).toBe(false);
  });
});
