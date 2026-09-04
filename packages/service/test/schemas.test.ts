import { describe, expect, it } from "vitest";
import {
  AjustePlaneacion,
  AnalisisBrechas,
  JobProgreso,
  Retroalimentacion,
  RetroalimentacionGenerada,
  EntradaRetroalimentacion,
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
  const base = {
    alias: "A-01",
    pdaReferidos: ["F3.LEN.02.1"],
    logros: "Identificaste la idea principal en dos textos.",
    brecha: "Todavía confundís un detalle con la idea central.",
    siguientePaso: "Subrayá de qué trata cada oración antes de responder.",
    texto: "Reconociste la idea principal en dos de los tres textos.",
  };

  it("acepta una retroalimentación válida", () => {
    expect(Retroalimentacion.safeParse(base).success).toBe(true);
  });

  it("rechaza un texto de más de 120 palabras", () => {
    const largo = { ...base, texto: "palabra ".repeat(121).trim() };
    expect(Retroalimentacion.safeParse(largo).success).toBe(false);
    expect(
      Retroalimentacion.safeParse({
        ...base,
        texto: "palabra ".repeat(120).trim(),
      }).success,
    ).toBe(true);
  });

  it("rechaza pdaReferidos vacío", () => {
    expect(
      Retroalimentacion.safeParse({ ...base, pdaReferidos: [] }).success,
    ).toBe(false);
  });

  it("RetroalimentacionGenerada exige estado y requiereRevision", () => {
    expect(RetroalimentacionGenerada.safeParse(base).success).toBe(false);
    expect(
      RetroalimentacionGenerada.safeParse({
        ...base,
        estado: "generado",
        requiereRevision: false,
      }).success,
    ).toBe(true);
  });

  it("un ausente entra como sinDatos, sin texto", () => {
    const ausente = { alias: "A-07", estado: "sinDatos" };
    expect(EntradaRetroalimentacion.safeParse(ausente).success).toBe(true);
    // sinDatos nunca lleva texto ni PDA: si viene, es una retro inventada.
    expect(
      EntradaRetroalimentacion.safeParse({ ...ausente, texto: "algo" }).success,
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
    confianza: "alta",
    pdaNoLogrados: [
      {
        pda: "F3.LEN.02.1",
        porcentaje: 36.4,
        patron: "Confunden un detalle con la idea central",
      },
    ],
    fortalezas: ["Localizan información explícita en el texto"],
    recomendacionGeneral: "Trabajar la idea principal con textos cortos.",
  };

  it("acepta un análisis válido", () => {
    expect(AnalisisBrechas.safeParse(base).success).toBe(true);
  });

  it("rechaza porcentaje fuera de 0..100", () => {
    const fuera = {
      ...base,
      pdaNoLogrados: [{ ...base.pdaNoLogrados[0], porcentaje: 140 }],
    };
    expect(AnalisisBrechas.safeParse(fuera).success).toBe(false);
  });

  it("rechaza una confianza fuera de alta|baja", () => {
    expect(
      AnalisisBrechas.safeParse({ ...base, confianza: "media" }).success,
    ).toBe(false);
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
    cambiosSecuencia: [
      { tipo: "agregar", descripcion: "Actividad remedial de 20 min" },
    ],
    actividadRemedial: {
      descripcion: "Lectura guiada en parejas",
      duracionMin: 20,
      pdaObjetivo: "F3.LEN.02.1",
    },
    medSugeridos: [],
    auditoria: {
      creadoEn: "2026-09-01T12:00:00.000Z",
      editadoRespectoOriginal: false,
    },
  };

  it("acepta una propuesta sin MED", () => {
    expect(AjustePlaneacion.safeParse(base).success).toBe(true);
  });

  it("solo acepta medSugerido con fuente mcp-buscar_med", () => {
    const conMed = (fuente: string) => ({
      ...base,
      medSugeridos: [{ medId: "MED-9", titulo: "Lectura guiada", fuente }],
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
