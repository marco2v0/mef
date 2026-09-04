import { beforeEach, describe, expect, it, vi } from "vitest";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    constructor(readonly status: number) {
      super(`status ${status}`);
    }
  }
  class Anthropic {
    messages = { parse };
    static APIError = APIError;
  }
  return { default: Anthropic, APIError };
});

const { generarRetro } = await import("../src/claude/retroalimentacion.js");
const { procesarJob } = await import("../src/worker.js");
const { PLANEACION_MOCK, RESULTADOS_MOCK } = await import("../src/db/seed.js");
const { SqliteRepository } = await import("../src/db/sqlite.js");
const { JobProgreso } = await import("../src/schemas/job.js");

const usage = { input_tokens: 10, output_tokens: 5 };

function salida(alias: string, pdaReferidos = PLANEACION_MOCK.pdas) {
  return {
    parsed_output: {
      alias,
      pdaReferidos,
      logros: "Identificaste la idea principal en dos textos.",
      brecha: "Todavía confundís un detalle con la idea central.",
      siguientePaso: "Subrayá de qué trata cada oración antes de responder.",
      texto: "Reconociste la idea principal en dos de los tres textos.",
    },
    usage,
  };
}

/** Alias que el mock recibió en el <resultado> de esta llamada. */
function aliasDe(req: { messages: [{ content: string }] }): string {
  return /<alias>(A-\d{2})<\/alias>/.exec(req.messages[0].content)![1]!;
}

const SALIDA_BRECHAS = {
  parsed_output: {
    pdaNoLogrados: [
      {
        pda: "F3.LEN.02.1",
        porcentaje: 36.4,
        patron: "Confunden un detalle con la idea central",
      },
    ],
    fortalezas: ["Localizan información explícita"],
    recomendacionGeneral: "Trabajar la idea principal con textos cortos.",
  },
  usage,
};

const SALIDA_AJUSTE = {
  parsed_output: {
    cambiosSecuencia: [
      { tipo: "agregar", descripcion: "Remedial de lectura guiada" },
    ],
    actividadRemedial: {
      descripcion: "Lectura guiada en parejas",
      duracionMin: 20,
      pdaObjetivo: "F3.LEN.02.1",
    },
  },
  usage,
};

/** El worker hace tres tipos de llamada; el mock responde según el user. */
function respuesta(req: { messages: [{ content: string }] }) {
  const user = req.messages[0].content;
  if (user.startsWith("<grupo")) return SALIDA_BRECHAS;
  if (user.startsWith("<brechas")) return SALIDA_AJUSTE;
  return salida(aliasDe(req));
}

/** Llamadas de retroalimentación por alumno, sin las de grupo. */
function llamadasDeRetro() {
  return parse.mock.calls.filter((c) =>
    (
      c[0] as { messages: [{ content: string }] }
    ).messages[0].content.startsWith("<resultado"),
  );
}

beforeEach(() => {
  parse.mockReset();
});

const presente = RESULTADOS_MOCK[0]!;

describe("generarRetro", () => {
  it("usa Haiku con effort low y cachea reglas NEM, fewshot y PDA", async () => {
    parse.mockResolvedValue(salida("A-01"));

    const retro = await generarRetro(PLANEACION_MOCK, presente);

    expect(retro.requiereRevision).toBe(false);
    const req = parse.mock.calls[0]![0];
    expect(req.model).toBe("claude-haiku-4-5-20251001");
    expect(req.output_config.effort).toBe("low");
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    const contexto = req.system[0].text as string;
    expect(contexto).toContain("<reglas_nem>");
    expect(contexto).toContain("máximo 120 palabras");
    expect(contexto).toContain("Identificaste con claridad la idea principal");
    expect(contexto).toContain("<pda>F3.LEN.02.1</pda>");
  });

  it("manda solo alias, criterios y observaciones en el <resultado>", async () => {
    parse.mockResolvedValue(salida("A-11"));
    const conAdecuacion = RESULTADOS_MOCK.find((r) => r.adecuacionCurricular)!;

    await generarRetro(PLANEACION_MOCK, conAdecuacion);

    const user = parse.mock.calls[0]![0].messages[0].content as string;
    expect(user).toContain("<alias>A-11</alias>");
    expect(user).toContain("<adecuacionCurricular>");
    expect(user).not.toMatch(/nombre|curp|@/i);
  });

  it("incluye observaciones de los flags", async () => {
    parse.mockResolvedValue(salida("A-03"));
    const conFlag = RESULTADOS_MOCK.find((r) => r.flags)!;

    await generarRetro(PLANEACION_MOCK, conFlag);

    expect(parse.mock.calls[0]![0].messages[0].content).toContain(
      "Se detuvo antes de terminar la actividad",
    );
  });

  it("reintenta una vez con el PDA inválido como feedback", async () => {
    parse
      .mockResolvedValueOnce(salida("A-01", ["F3.MAT.99.9"]))
      .mockResolvedValueOnce(salida("A-01"));

    const retro = await generarRetro(PLANEACION_MOCK, presente);

    expect(retro.requiereRevision).toBe(false);
    expect(parse).toHaveBeenCalledTimes(2);
    const segundoUser = parse.mock.calls[1]![0].messages[0].content as string;
    expect(segundoUser).toContain("<error_intento_anterior>");
    expect(segundoUser).toContain("F3.MAT.99.9");
  });

  it("marca requiereRevision si insiste con un PDA inexistente", async () => {
    parse.mockResolvedValue(salida("A-01", ["F3.MAT.99.9"]));

    const retro = await generarRetro(PLANEACION_MOCK, presente);

    expect(retro.requiereRevision).toBe(true);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("fuerza el alias del resultado aunque el modelo devuelva otro", async () => {
    parse.mockResolvedValue(salida("A-99"));

    expect((await generarRetro(PLANEACION_MOCK, presente)).alias).toBe("A-01");
  });

  it("falla si el texto excede 120 palabras", async () => {
    const largo = salida("A-01");
    largo.parsed_output.texto = "palabra ".repeat(121).trim();
    parse.mockResolvedValue(largo);

    await expect(generarRetro(PLANEACION_MOCK, presente)).rejects.toThrow();
  });
});

describe("procesarJob", () => {
  let repo: InstanceType<typeof SqliteRepository>;

  beforeEach(() => {
    repo = new SqliteRepository();
    repo.seedParaDesarrollo();
  });

  const input = () => ({
    planeacionId: PLANEACION_MOCK.planeacionId,
    actividadId: PLANEACION_MOCK.actividadId,
    grupoId: PLANEACION_MOCK.grupoId,
    cicloEscolarId: PLANEACION_MOCK.cicloEscolarId,
    resultados: RESULTADOS_MOCK,
  });

  it("genera retro de los 11 presentes con concurrencia 4 y completa el job", async () => {
    let enVuelo = 0;
    let pico = 0;
    parse.mockImplementation(
      async (req: { messages: [{ content: string }] }) => {
        enVuelo++;
        pico = Math.max(pico, enVuelo);
        await new Promise((r) => setTimeout(r, 1));
        enVuelo--;
        return respuesta(req);
      },
    );

    const job = await repo.createJob(input());
    await procesarJob(repo, job, input());

    const final = JobProgreso.parse(await repo.getJob(job.jobId));
    expect(final.estado).toBe("completado");
    expect(final.total).toBe(11);
    expect(final.completados).toBe(11);
    expect(final.requierenRevision).toEqual([]);
    // 11 presentes generados + A-07 ausente listado como sinDatos.
    expect(final.retroalimentaciones).toHaveLength(12);
    expect(pico).toBe(4);
    expect(llamadasDeRetro()).toHaveLength(11);
  });

  it("lista al ausente con estado sinDatos y sin texto, sin llamar a Claude", async () => {
    parse.mockImplementation(async (req: { messages: [{ content: string }] }) =>
      respuesta(req),
    );

    const job = await repo.createJob(input());
    await procesarJob(repo, job, input());

    const entradas = JobProgreso.parse(
      await repo.getJob(job.jobId),
    ).retroalimentaciones!;
    expect(entradas.find((r) => r.alias === "A-07")).toEqual({
      alias: "A-07",
      estado: "sinDatos",
    });
    expect(entradas.filter((e) => e.estado === "generado")).toHaveLength(11);
    expect(llamadasDeRetro().map((c) => aliasDe(c[0]))).not.toContain("A-07");
  });

  it("marca en requierenRevision al alumno que falla y sigue con el resto", async () => {
    parse.mockImplementation(
      async (req: { messages: [{ content: string }] }) => {
        if (req.messages[0].content.includes("<alias>A-08</alias>"))
          throw new Error("boom");
        return respuesta(req);
      },
    );

    const job = await repo.createJob(input());
    await procesarJob(repo, job, input());

    const final = (await repo.getJob(job.jobId))!;
    expect(final.estado).toBe("completado");
    expect(final.completados).toBe(11);
    expect(final.requierenRevision).toEqual(["A-08"]);
    // 10 generadas (A-08 falló) + A-07 sinDatos.
    expect(final.retroalimentaciones).toHaveLength(11);
  });

  it("marca en requierenRevision al alumno con PDA inventado", async () => {
    parse.mockImplementation(
      async (req: { messages: [{ content: string }] }) => {
        if (!req.messages[0].content.startsWith("<resultado"))
          return respuesta(req);
        const alias = aliasDe(req);
        return salida(alias, alias === "A-05" ? ["F3.MAT.99.9"] : undefined);
      },
    );

    const job = await repo.createJob(input());
    await procesarJob(repo, job, input());

    expect((await repo.getJob(job.jobId))?.requierenRevision).toEqual(["A-05"]);
  });

  it("va publicando el avance en JobProgreso, no solo al final", async () => {
    parse.mockImplementation(async (req: { messages: [{ content: string }] }) =>
      respuesta(req),
    );
    const vistos: number[] = [];
    const original = repo.updateJob.bind(repo);
    vi.spyOn(repo, "updateJob").mockImplementation(async (j) => {
      vistos.push(j.completados);
      await original(j);
    });

    const job = await repo.createJob(input());
    await procesarJob(repo, job, input());

    expect(vistos.slice(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it("al cerrar el lote agrega brechas y ajuste, y guarda la propuesta", async () => {
    parse.mockImplementation(async (req: { messages: [{ content: string }] }) =>
      respuesta(req),
    );

    const job = await repo.createJob(input());
    await procesarJob(repo, job, input());

    const final = JobProgreso.parse(await repo.getJob(job.jobId));
    expect(final.brechas?.n).toBe(11);
    expect(final.brechas?.confianza).toBe("alta");
    expect(final.ajuste?.estado).toBe("borrador");
    expect(final.ajuste?.medSugeridos).toEqual([]);
    // La propuesta queda accesible por GET /v1/planeacion-ajuste/{actividadId}.
    expect(await repo.getPropuesta(PLANEACION_MOCK.actividadId)).toMatchObject({
      id: final.ajuste!.id,
    });
  });

  it("no pisa una propuesta que el docente ya aprobó", async () => {
    parse.mockImplementation(async (req: { messages: [{ content: string }] }) =>
      respuesta(req),
    );
    const aprobada = {
      ...(await repo.getPropuesta(PLANEACION_MOCK.actividadId))!,
      estado: "aprobado" as const,
    };
    await repo.savePropuesta(aprobada);

    const job = await repo.createJob(input());
    await procesarJob(repo, job, input());

    expect(await repo.getPropuesta(PLANEACION_MOCK.actividadId)).toEqual(
      aprobada,
    );
    // El ajuste nuevo igual queda en el job, para que el docente lo vea.
    expect((await repo.getJob(job.jobId))?.ajuste?.estado).toBe("borrador");
  });

  it("si falla el análisis de grupo, el job cierra igual con las retros", async () => {
    parse.mockImplementation(
      async (req: { messages: [{ content: string }] }) => {
        if (req.messages[0].content.startsWith("<grupo"))
          throw new Error("brechas caídas");
        return respuesta(req);
      },
    );

    const job = await repo.createJob(input());
    await procesarJob(repo, job, input());

    const final = JobProgreso.parse(await repo.getJob(job.jobId));
    expect(final.estado).toBe("completado");
    expect(final.retroalimentaciones).toHaveLength(12);
    expect(final.brechas).toBeUndefined();
    expect(final.ajuste).toBeUndefined();
  });

  it("deja el job en error si la planeación no existe", async () => {
    const job = await repo.createJob(input());
    await procesarJob(repo, job, {
      ...input(),
      planeacionId: "PLAN-INEXISTENTE",
    });

    expect((await repo.getJob(job.jobId))?.estado).toBe("error");
    expect(parse).not.toHaveBeenCalled();
  });
});
